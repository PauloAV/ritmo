// Cria um único cliente do Supabase para o app inteiro.
// A biblioteca vem de um CDN como módulo ES, então o projeto não precisa de bundler.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
