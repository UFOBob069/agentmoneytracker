declare global {
  interface Window {
    gtag: (
      command: 'config' | 'event' | 'js',
      targetId: string,
      config?: {
        page_title?: string;
        page_location?: string;
        method?: string;
        custom_parameter?: string;
        [key: string]: unknown;
      }
    ) => void;
    dataLayer: unknown[];
  }
}

export {};
