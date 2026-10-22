import { Exam, Building, WebsiteSettings } from '../types';
import { INITIAL_SETTINGS } from '../data/initialData';

// Public settings remain static site copy for this phase. Exam/application data
// comes from Supabase; no personal records are stored in browser memory here.
const settings = INITIAL_SETTINGS;
const buildings: Building[] = [];

export function getSettings(): WebsiteSettings {
  return settings;
}

export function getBuildings(): Building[] {
  return buildings;
}
