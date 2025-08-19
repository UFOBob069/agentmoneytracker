import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '../../../../lib/stripe';
import { adminDb } from '../../../../lib/firebaseAdmin';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();
    const requestId = randomUUID();
    console.log('[portal] incoming', { requestId, userIdPresent: !!userId, origin: request.nextUrl.origin });
    
    if (!userId) {
      console.log('[portal] missing userId', { requestId });
      return NextResponse.json({ error: 'User ID is required', requestId },{ status: 400 });
    }
    
    if (!stripe) {
      console.log('[portal] stripe not initialized', { requestId, hasSecret: !!process.env.STRIPE_SECRET_KEY });
      return NextResponse.json({ error: 'Stripe is not initialized', requestId },{ status: 500 });
    }
    
    // Get user subscription from Firestore (admin)
    const userRef = adminDb.collection('userSubscriptions').doc(userId);
    console.log('[portal] fetching user subscription', { requestId, userId });
    
    const userDoc = await userRef.get();
    console.log('[portal] user doc exists', { requestId, exists: userDoc.exists });
    
    if (!userDoc.exists) {
      console.log('[portal] user subscription not found', { requestId, userId });
      return NextResponse.json({ 
        error: 'User subscription not found. Please ensure you have an active subscription.', requestId
      }, { status: 404 });
    }
    
    const userData = userDoc.data() as Record<string, unknown>;
    console.log('[portal] user subscription data loaded', { requestId, hasCustomerId: !!userData.stripeCustomerId });
    
    const stripeCustomerId = userData.stripeCustomerId as string | undefined;
    console.log('[portal] stripe customer id', { requestId, hasCustomerId: !!stripeCustomerId });
    
    if (!stripeCustomerId) {
      console.log('[portal] missing stripe customer id', { requestId, userId });
      return NextResponse.json({ 
        error: 'No Stripe customer ID found. Please contact support.', requestId
      }, { status: 400 });
    }
    
    // Create portal session
    console.log('[portal] creating portal session', { requestId, userId });
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId as string,
      return_url: `${request.nextUrl.origin}/dashboard`,
    });
    
    console.log('[portal] session created', { requestId, url: session.url });
    return NextResponse.json({ url: session.url, requestId });
  } catch (error: unknown) {
    console.error('[portal] error creating portal session', {
      name: (error as Error & { code?: string })?.name,
      message: (error as Error & { code?: string })?.message,
      code: (error as { code?: string })?.code,
    });
    return NextResponse.json({ 
      error: 'Failed to create portal session. Please try again or contact support.' 
    }, { status: 500 });
  }
} 