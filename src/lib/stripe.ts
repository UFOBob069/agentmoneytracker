import Stripe from 'stripe';

// Server-side Stripe instance
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// Server-side environment variable check
if (typeof window === 'undefined' && !process.env.STRIPE_SECRET_KEY) {
  console.warn('Stripe secret key not found in environment variables.');
}

// Client-side Stripe instance
export const getStripe = async () => {
  if (typeof window !== 'undefined') {
    try {
      const { loadStripe } = await import('@stripe/stripe-js');
      const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      
      console.log('Stripe publishable key check:', {
        hasKey: !!publishableKey,
        keyPrefix: publishableKey ? publishableKey.substring(0, 7) : 'none',
        isLive: publishableKey?.startsWith('pk_live_'),
        isTest: publishableKey?.startsWith('pk_test_')
      });
      
      if (!publishableKey) {
        console.warn('Stripe publishable key not found in environment variables.');
        return null;
      }
      
      const stripe = await loadStripe(publishableKey);
      console.log('Stripe loaded successfully:', !!stripe);
      return stripe;
    } catch (error) {
      console.error('Error loading Stripe:', error);
      return null;
    }
  }
  return null;
};

// Pricing configuration
export const PRICING = {
  MONTHLY: {
    price: 497, // $4.97 in cents
    interval: 'month',
    trialDays: 30,
  },
  YEARLY: {
    price: 4900, // $49.00 in cents
    interval: 'year',
    trialDays: 30,
  },
};

// Stripe product and price IDs (you'll need to create these in your Stripe dashboard)
export const STRIPE_CONFIG = {
  PRODUCT_ID: process.env.STRIPE_PRODUCT_ID || 'prod_xxx', // Replace with your product ID
  MONTHLY_PRICE_ID: process.env.STRIPE_MONTHLY_PRICE_ID || 'price_xxx', // Replace with your monthly price ID
  YEARLY_PRICE_ID: process.env.STRIPE_YEARLY_PRICE_ID || 'price_xxx', // Replace with your yearly price ID
};

// Subscription status types
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid';

// User subscription interface
export interface UserSubscription {
  userId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  status: SubscriptionStatus;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  trialStart?: Date;
  trialEnd?: Date;
  planType?: 'monthly' | 'yearly';
  couponCode?: string;
  createdAt: Date;
  updatedAt: Date;
} 