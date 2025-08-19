import { NextRequest, NextResponse } from 'next/server';
import { stripe, STRIPE_CONFIG } from '../../../../lib/stripe';
import { adminDb } from '../../../../lib/firebaseAdmin';
import Stripe from 'stripe';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const debugEnabled: boolean = process.env.CHECKOUT_DEBUG === '1';
  try {
    const { userId, email, planType, couponCode } = await request.json();

    console.log('[checkout] incoming', {
      requestId,
      userIdPresent: !!userId,
      emailPresent: !!email,
      planType,
      origin: request.nextUrl.origin,
    });

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
      console.error('[checkout] price id not configured', { requestId, planType, priceId });
      return NextResponse.json({ error: 'Stripe price ID not configured', requestId }, { status: 500 });
    }

    // Check if user already has a Stripe customer ID
    if (!stripe) {
      console.error('[checkout] stripe not initialized', {
        requestId,
        hasSecret: !!process.env.STRIPE_SECRET_KEY,
      });
      return NextResponse.json({ error: 'Stripe is not initialized', requestId }, { status: 500 });
    }
    const userRef = adminDb.collection('userSubscriptions').doc(userId);
    let stripeCustomerId: string | undefined = undefined;
    try {
      const userSnap = await userRef.get();
      stripeCustomerId = userSnap.exists
        ? ((userSnap.data() as Record<string, unknown>)?.stripeCustomerId as string | undefined)
        : undefined;
    } catch (e) {
      console.warn('[checkout] firestore read failed (continuing without customerId)', { requestId, error: e instanceof Error ? e.message : String(e) });
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
      console.log('[checkout] created stripe customer', { requestId, stripeCustomerId });
    } else {
      console.log('[checkout] using existing stripe customer', { requestId, stripeCustomerId });
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

    console.log('[checkout] creating session', {
      requestId,
      priceId,
      userId,
      planType,
      hasCustomer: !!stripeCustomerId,
      success_url: sessionParams.success_url,
      cancel_url: sessionParams.cancel_url,
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

    console.log('[checkout] session created', {
      requestId,
      sessionId: session.id,
      success_url: session.success_url,
      cancel_url: session.cancel_url,
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
      console.log('[checkout] seed subscription doc written', { requestId, userId });
    } catch (e) {
      console.warn('[checkout] firestore write failed (webhook will backfill)', { requestId, error: e instanceof Error ? e.message : String(e) });
    }

    return NextResponse.json({ sessionId: session.id });
  } catch (error: unknown) {
    console.error('[checkout] error creating session', {
      requestId,
      name: (error as Error & { type?: string; code?: string })?.name,
      message: (error as Error & { type?: string; code?: string })?.message,
      type: (error as { type?: string })?.type,
      code: (error as { code?: string })?.code,
    });

    const body: Record<string, unknown> = { error: 'Failed to create checkout session', requestId };
    if (debugEnabled) {
      body.details = {
        name: (error as Error & { type?: string; code?: string })?.name,
        message: (error as Error & { type?: string; code?: string })?.message,
        type: (error as { type?: string })?.type,
        code: (error as { code?: string })?.code,
      };
    }
    return NextResponse.json(body, { status: 500 });
  }
} 