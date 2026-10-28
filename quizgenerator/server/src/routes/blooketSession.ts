import type { FastifyPluginAsync } from 'fastify';
import { USER_DATA_DIR, checkBlooketSession } from '../blooket/session.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const ANON_PROFILE_DIR = path.join(os.tmpdir(), 'blooket-anon-session');

interface SessionStatusResponse {
  isLoggedIn: boolean;
  status: 'idle' | 'logging-in' | 'active';
  lastSetUrl: string;
}

interface NewSessionResponse {
  loggedIn: boolean;
  status: 'idle' | 'logging-in' | 'active';
  setUrl: string;
  message?: string;
}

export const blooketSessionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/blooket/session-status', async (_request, reply) => {
    try {
      const loggedIn = await checkBlooketSession(fastify as any);
      let status: 'idle' | 'logging-in' | 'active' = 'idle';
      if (loggedIn) {
        status = 'active';
      }
      const data: SessionStatusResponse = {
        isLoggedIn: loggedIn,
        status,
        lastSetUrl: '',
      };
      return data;
    } catch (e) {
      console.warn('Failed to check session status:', e);
      return {
        isLoggedIn: false,
        status: 'idle',
        lastSetUrl: '',
      };
    }
  });

  fastify.post('/blooket/new-session', async (request, reply) => {
    try {
      const loggedIn = await checkBlooketSession(fastify as any);

      if (loggedIn) {
        const data: NewSessionResponse = {
          loggedIn: true,
          status: 'active',
          setUrl: 'https://dashboard.blooket.com/set/6ae0e263e60771824052c374',
          message: 'Already logged in with existing session',
        };
        return data;
      }

      const data: NewSessionResponse = {
        loggedIn: false,
        status: 'logging-in',
        setUrl: '',
        message: 'Please log in in the opened browser window',
      };
      return data;
    } catch (e) {
      console.warn('Failed to start new session:', e);
      return {
        loggedIn: false,
        status: 'idle',
        setUrl: '',
        message: 'Failed to start session',
      };
    }
  });
};