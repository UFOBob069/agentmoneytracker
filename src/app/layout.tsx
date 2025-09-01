import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "./Header";
import Script from "next/script";
import Image from "next/image";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Agent Money Tracker - Real Estate Commission & Expense Tracking",
  description: "Track your real estate deals, commissions, expenses, and mileage. Built specifically for real estate agents to manage their financial tracking.",
  keywords: "real estate, commission tracking, expense tracking, mileage tracking, real estate agent tools",
  authors: [{ name: "Agent Money Tracker" }],
  creator: "Agent Money Tracker",
  publisher: "Agent Money Tracker",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL('https://agentmoneytracker.com'),
  openGraph: {
    title: "Agent Money Tracker - Real Estate Commission & Expense Tracking",
    description: "Track your real estate deals, commissions, expenses, and mileage. Built specifically for real estate agents to manage their financial tracking.",
    url: 'https://agentmoneytracker.com',
    siteName: 'Agent Money Tracker',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "Agent Money Tracker - Real Estate Commission & Expense Tracking",
    description: "Track your real estate deals, commissions, expenses, and mileage. Built specifically for real estate agents to manage their financial tracking.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Facebook Pixel Code */}
        <Script
          id="facebook-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '263977355782414');
              fbq('track', 'PageView');
            `,
          }}
        />
        <noscript>
          <Image 
            height={1} 
            width={1} 
            style={{ display: 'none' }}
            src="https://www.facebook.com/tr?id=263977355782414&ev=PageView&noscript=1"
            alt=""
          />
        </noscript>
        {/* End Facebook Pixel Code */}
        
        {/* Google tag (gtag.js) */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-XKP9S9CNKJ"
          strategy="afterInteractive"
        />
        <Script
          id="google-analytics"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-XKP9S9CNKJ');
            `,
          }}
        />
        {/* End Google tag */}
      </head>
      <body className={`${inter.className} bg-gray-50 min-h-screen`}>
        <Header />
        <div className="min-h-[80vh]">
          {children}
        </div>
      </body>
    </html>
  );
}
