import OpenAI from 'openai';
import { env } from '../env';

// Singleton — never instantiate OpenAI outside this file
export const aiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
