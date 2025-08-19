import { NextRequest, NextResponse } from 'next/server';
import { stripe, STRIPE_CONFIG } from '../../../../lib/stripe';
import { adminDb } from '../../../../lib/firebaseAdmin';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { userId, email, planType, couponCode } = await request.json();

    if (!userId || !email || !planType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get the appropriate price ID based on plan type
    const priceId = planType === 'yearly' 
      ? STRIPE_CONFIG.YEARLY_PRICE_ID 
      : STRIPE_CONFIG.MONTHLY_PRICE_ID;
    if (!priceId || priceId === 'price_xxx') {
      return NextResponse.json({ error: 'Stripe price ID not configured' }, { status: 500 });
    }

    // Check if user already has a Stripe customer ID
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe is not initialized' }, { status: 500 });
    }
    const userRef = adminDb.collection('userSubscriptions').doc(userId);
    let stripeCustomerId: string | undefined = undefined;
    try {
      const userSnap = await userRef.get();
      stripeCustomerId = userSnap.exists
        ? ((userSnap.data() as Record<string, unknown>)?.stripeCustomerId as string | undefined)
        : undefined;
    } catch (e) {
      console.warn('Firestore read failed (continuing without customerId):', e);
    }

    // Create Stripe customer if doesn't exist
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: {
          userId,
        },
      });
      stripeCustomerId = customer.id;
    }

    // Prepare checkout session parameters
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${request.nextUrl.origin}/dashboard?success=true`,
      cancel_url: `${request.nextUrl.origin}/signup?canceled=true`,
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: 30,
        metadata: {
          userId,
          planType,
        },
      },
      metadata: {
        userId,
        planType,
      },
    };

    if (typeof stripeCustomerId === 'string' && stripeCustomerId.length > 0) {
      sessionParams.customer = stripeCustomerId;
    }

    console.log('Creating checkout session with params:', {
      success_url: sessionParams.success_url,
      cancel_url: sessionParams.cancel_url,
      priceId,
      userId,
      planType
    });

    // Add coupon if provided
    if (couponCode) {
      sessionParams.discounts = [
        {
          coupon: couponCode,
        },
      ];
    }

    // Create checkout session
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe is not initialized' }, { status: 500 });
    }
    const session = await stripe.checkout.sessions.create(sessionParams);

    console.log('Checkout session created:', {
      sessionId: session.id,
      success_url: session.success_url,
      cancel_url: session.cancel_url
    });

    // Save initial subscription record (best-effort)
    try {
      await userRef.set({
        userId,
        stripeCustomerId,
        status: 'incomplete',
        planType,
        couponCode: couponCode || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }, { merge: true });
    } catch (e) {
      console.warn('Firestore write failed (webhook will backfill):', e);
    }

    return NextResponse.json({ sessionId: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    
    // Log more details about the error
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    
    // Check if it's a Stripe error
    if (error && typeof error === 'object' && 'type' in error) {
      const stripeError = error as { type?: string; code?: string; message?: string };
      console.error('Stripe error type:', stripeError.type);
      console.error('Stripe error code:', stripeError.code);
      console.error('Stripe error message:', stripeError.message);
    }
    
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
} 