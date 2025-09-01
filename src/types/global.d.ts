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
    fbq: (
      command: 'track',
      eventName: string,
      parameters?: {
        value?: number;
        currency?: string;
        predicted_ltv?: string;
        [key: string]: unknown;
      }
    ) => void;
  }
}

export {};
