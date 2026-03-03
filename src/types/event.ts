export type Event = {
  id: string;
  title: string;
  address?: string;
  description?: string;
  dateISO?: string;
  lat: number;
  lng: number;
  createdAtISO: string;
};
