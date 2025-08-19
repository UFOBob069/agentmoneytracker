import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '../../../../lib/stripe';
import { adminDb } from '../../../../lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();
    console.log('Portal session request for userId:', userId);
    
    if (!userId) {
      console.log('Error: No userId provided');
      return NextResponse.json({ error: 'User ID is required' },{ status: 400 });
    }
    
    if (!stripe) {
      console.log('Error: Stripe is not initialized');
      return NextResponse.json({ error: 'Stripe is not initialized' },{ status: 500 });
    }
    
    // Get user subscription from Firestore (admin)
    const userRef = adminDb.collection('userSubscriptions').doc(userId);
    console.log('Fetching user subscription for userId:', userId);
    
    const userDoc = await userRef.get();
    console.log('User document exists:', userDoc.exists);
    
    if (!userDoc.exists) {
      console.log('Error: User subscription not found for userId:', userId);
      return NextResponse.json({ 
        error: 'User subscription not found. Please ensure you have an active subscription.' 
      }, { status: 404 });
    }
    
    const userData = userDoc.data() as Record<string, unknown>;
    console.log('User subscription data:', userData);
    
    const stripeCustomerId = userData.stripeCustomerId as string | undefined;
    console.log('Stripe customer ID:', stripeCustomerId);
    
    if (!stripeCustomerId) {
      console.log('Error: No Stripe customer ID found for userId:', userId);
      return NextResponse.json({ 
        error: 'No Stripe customer ID found. Please contact support.' 
      }, { status: 400 });
    }
    
    // Create portal session
    console.log('Creating portal session for customer:', stripeCustomerId);
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId as string,
      return_url: `${request.nextUrl.origin}/dashboard`,
    });
    
    console.log('Portal session created successfully:', session.url);
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Error creating portal session:', error);
    return NextResponse.json({ 
      error: 'Failed to create portal session. Please try again or contact support.' 
    }, { status: 500 });
  }
} 