export type OptionKey = "أ" | "ب" | "ج" | "د";

export const OPTION_KEYS: OptionKey[] = ["أ", "ب", "ج", "د"];

export interface Option {
  key: OptionKey;
  text: string;
}

export interface Ayah {
  text: string;
  ref: string;
}

export interface Field {
  id: string;
  label: string;
  subjects: string[];
}

export interface Question {
  id: string;
  question: string;
  image?: string;
  imageName?: string;
  options: [Option, Option, Option, Option];
  correct: OptionKey;
  field: string;
  subject: string;
  grade?: string;
  author: string;
  ayah?: Ayah | null;
  likes: number;
  reactions: number;
  answersCount: number;
  mine?: boolean;
}

export type AnswerState = {
  chosen: OptionKey;
  correct: boolean;
};

export type Scope = "mine-field" | "all";

export interface UserProfile {
  name: string;
  field: string;
  grade: string;
}