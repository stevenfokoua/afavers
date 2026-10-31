/** Provider data shared by pure mapping code and the Edge worker. */
export interface ExternalJob {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  postedDate?: string;
  deadline?: string;
  salary?: string;
  descriptionQuality?: 'summary' | 'full';
  detailsCheckedAt?: string;
}
