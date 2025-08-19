import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '../../../../lib/stripe';
import { adminDb } from '../../../../lib/firebaseAdmin';
import Stripe from 'stripe';

type StripeSubscriptionWithPeriod = Stripe.Subscription & {
  current_period_start: number;
  current_period_end: number;
};

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');
  
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe is not initialized' }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.userId && session.customer) {
          const userId = session.metadata.userId;
          const customerId = typeof session.customer === 'string' ? session.customer : session.customer.id;
          const subscriptionRef = adminDb.collection('userSubscriptions').doc(userId);
          await subscriptionRef.set({
            userId,
            stripeCustomerId: customerId,
            stripeSubscriptionId: session.subscription as string,
            status: 'trialing',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          console.log('Subscription record created for user:', userId);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as StripeSubscriptionWithPeriod;
        if (subscription.metadata?.userId) {
          const userId = subscription.metadata.userId;
          const subscriptionRef = adminDb.collection('userSubscriptions').doc(userId);
          await subscriptionRef.update({
            stripeSubscriptionId: subscription.id,
            status: subscription.status,
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
            trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
            planType: subscription.items.data[0]?.price.recurring?.interval as 'monthly' | 'yearly',
            updatedAt: new Date(),
          });
          console.log('Subscription record updated for user:', userId);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        if (subscription.metadata?.userId) {
          const userId = subscription.metadata.userId;
          const subscriptionRef = adminDb.collection('userSubscriptions').doc(userId);
          await subscriptionRef.update({
            status: 'canceled',
            updatedAt: new Date(),
          });
          console.log('Subscription marked as canceled for user:', userId);
        }
        break;
      }
      default:
        console.log('Unhandled event type:', event.type);
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
} 