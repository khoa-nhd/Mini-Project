export const MAX_Q_LEN = 250;
export const MAX_A_LEN = 100;
export const MAX_QUESTIONS = 500;
export const MIN_TIME = 1;
export const MAX_TIME = 300;
export const DEFAULT_TIME = 20;

export const BLOOKET_CSV_HEADER_ROW_1 = 'Blooket\nImport Template';
export const BLOOKET_CSV_HEADER_ROW_2 = [
  'Question #',
  'Question Text',
  'Answer 1',
  'Answer 2',
  'Answer 3\n(Optional)',
  'Answer 4\n(Optional)',
  'Time Limit (sec)\n(Max: 300 seconds)',
  'Correct Answer(s)\n(Only include Answer #)',
  '',
  '',
];

export const TOTAL_CSV_COLUMNS = 26;

export const BLOOKET_URLS = {
  LOGIN: 'https://id.blooket.com/login',
  DASHBOARD: 'https://dashboard.blooket.com',
  CREATE_SET: 'https://dashboard.blooket.com/create',
  SET_PREFIX: 'https://dashboard.blooket.com/set/',
};
