// Типы ответов публичного API recyclemap.ru.
// Источник: наблюдаемый формат JSON на 2026-04-22.

export type RSBorFraction = {
  id: number;
  name: string;
  type: string; // "RC"
  color: string; // HEX
  icon: string; // имя SVG-файла
};

export type RSBorScheduleDay = {
  dow: number;
  opens: string[];
  closes: string[];
};

export type RSBorOperator = {
  operatorId: number;
  title: string;
  address: string;
  phones: string[];
  emails: string[];
  sites: string[];
};

export type RSBorPhoto = {
  photo_id: number;
  order: number;
  path: string;
  thumb: string | null;
};

export type RSBorPointListItem = {
  geom: string; // "POINT(lng lat)"
  pointId: number;
  pointType: string;
  address: string;
  title: string;
  restricted: boolean;
  rating: { likes: number; dislikes: number; score: number };
  fractions: RSBorFraction[];
  businesHoursState: { state: string; nextStateTime: string; expired: boolean };
  numberOfComments: number;
};

export type RSBorPointDetails = RSBorPointListItem & {
  addressDescription: string;
  pointDescription: string;
  precise: boolean;
  scheduleDescription: string | null;
  photos: RSBorPhoto[];
  schedule: RSBorScheduleDay[];
  validDates: unknown[];
  operator: RSBorOperator | null;
  partner: unknown;
  lastUpdate: string; // "2025-08-05"
  moderators: unknown[];
  comments: unknown[];
};

export type RSBorApiResponse<T> =
  | { isSuccess: true; data: T }
  | { isSuccess: false; errors: { message: string; trace: string | null } };

export type RSBorPointsListResponse = {
  totalResults: number;
  points: RSBorPointListItem[];
};
