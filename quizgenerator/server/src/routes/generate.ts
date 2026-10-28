import type { FastifyPluginAsync } from 'fastify';
import { extractFileContent } from '../extractors/index.js';
import { chunkDocumentText } from '../llm/chunker.js';
import { extractFromChunk } from '../llm/gemini.js';

export const generateRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/generate', async (request, reply) => {
    // Set headers for SSE stream
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders?.();

    const sendEvent = (event: string, data: any) => {
      reply.raw.write(`data: ${JSON.stringify({ event, ...data })}\n\n`);
    };

    try {
      const parts = request.parts();
      const files: { filename: string; mimeType: string; buffer: Buffer }[] = [];
      let prompt = '';

      for await (const part of parts) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer();
          files.push({
            filename: part.filename,
            mimeType: part.mimetype,
            buffer,
          });
        } else {
          if (part.fieldname === 'prompt') {
            prompt = String(part.value);
          }
        }
      }

      if (files.length === 0) {
        sendEvent('error', { message: 'No files uploaded.' });
        reply.raw.end();
        return;
      }

      // 1. Extract content from all uploaded files
      let combinedText = '';
      let imageBuffer: Buffer | undefined;
      let imageMimeType: string | undefined;

      for (const file of files) {
        const extracted = await extractFileContent(
          file.filename,
          file.mimeType,
          file.buffer
        );
        if (extracted.text) {
          combinedText += `\n\n--- FILE: ${file.filename} ---\n` + extracted.text;
        }
        if (extracted.imageBuffer) {
          imageBuffer = extracted.imageBuffer;
          imageMimeType = extracted.mimeType;
        }
      }

      // 2. Chunk text
      const chunks = chunkDocumentText(combinedText);
      let totalExtracted = 0;
      let titleSet = false;
      // Chunk failures used to be swallowed, turning a 503 into HTTP 200 +
      // "Extracted 0 questions successfully!". Track them so the client can tell.
      const failedChunks: { chunk: number; error: string }[] = [];

      // 3. Process chunks (run in batches of 3 max)
      const CONCURRENCY = 3;
      for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        const batch = chunks.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map((chunk) =>
            extractFromChunk(
              chunk.text,
              prompt,
              chunk.answerKey,
              imageBuffer,
              imageMimeType
            ).catch((err) => {
              const message = String(err?.message || err);
              console.error(`Chunk ${chunk.chunkIndex} error:`, message);
              failedChunks.push({ chunk: chunk.chunkIndex, error: message });
              return { title: undefined, questions: [] };
            })
          )
        );

        for (let b = 0; b < batch.length; b++) {
          const chunk = batch[b];
          const res = results[b];

          if (!titleSet && res.title) {
            sendEvent('meta', { title: res.title });
            titleSet = true;
          }

          sendEvent('progress', {
            chunk: chunk.chunkIndex,
            total: chunks.length,
          });

          for (const q of res.questions) {
            sendEvent('question', { question: q });
            totalExtracted++;
          }
        }
      }

      if (totalExtracted === 0 && failedChunks.length > 0) {
        // Every chunk failed (rate limit / 503 / bad key): this is an error, not
        // a successful empty extraction.
        sendEvent('error', {
          message: `Extraction failed: ${failedChunks[0].error}`,
          failedChunks: failedChunks.length,
          totalChunks: chunks.length,
        });
      } else {
        sendEvent('done', {
          stats: {
            total: totalExtracted,
            chunks: chunks.length,
            failedChunks: failedChunks.length,
          },
          ...(failedChunks.length > 0
            ? {
                warning: `${failedChunks.length} of ${chunks.length} chunk(s) failed (chunks ${failedChunks
                  .map((f) => f.chunk)
                  .join(', ')}). Those questions are missing — retry to include them.`,
              }
            : {}),
        });
      }

      reply.raw.end();
    } catch (err: any) {
      sendEvent('error', { message: err.message || 'Generation error' });
      reply.raw.end();
    }
  });
};
