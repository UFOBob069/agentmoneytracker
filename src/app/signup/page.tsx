"use client";
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { auth, db } from '../../firebase';
import { GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import PricingPlans from '../../components/PricingPlans';
import { getStripe } from '../../lib/stripe';
import { setCookie } from 'cookies-next';

type SignupStep = 'account' | 'pricing' | 'checkout';

export default function SignUpPage() {
  const [step, setStep] = useState<SignupStep>('account');
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<import('firebase/auth').User | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
  });
  // Remove unused router
  // const router = useRouter();

  // Function to create initial subscription record
  const createSubscriptionRecord = async (userId: string, email: string) => {
    try {
      const userRef = doc(db, 'userSubscriptions', userId);
      await setDoc(userRef, {
        userId,
        email,
        status: 'incomplete',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log('Created initial subscription record for user:', userId);
    } catch (error) {
      console.error('Error creating subscription record:', error);
    }
  };

  // Function to create initial user profile record
  const createUserProfileRecord = async (userId: string, email: string) => {
    try {
      console.log('Creating user profile record for:', userId, email);
      const profileRef = doc(db, 'userProfiles', userId);
      const profileData = {
        userId,
        email,
        startOfCommissionYear: new Date(new Date().getFullYear(), 0, 1), // January 1st of current year
        commissionType: 'percentage',
        companySplitPercent: 30,
        companySplitCap: 5000,
        royaltyPercent: 6,
        royaltyCap: 3000,
        fixedCommissionAmount: 0,
        // Personal/Business Information
        firstName: "",
        lastName: "",
        phone: "",
        company: "",
        licenseNumber: "",
        zipCode: "",
        state: "",
        // Financial Tracking
        monthlyGoal: 0,
        annualGoal: 0,
        emergencyFund: 0,
        retirementContribution: 0,
        // Additional Settings
        currency: "USD",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        notifications: {
          email: false,
          push: false,
          capAlerts: true,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      console.log('Profile data to save:', profileData);
      await setDoc(profileRef, profileData);
      console.log('Successfully created user profile record for user:', userId);
      
      // Add a small delay to ensure the write completes
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('Delay completed after profile creation');
      
    } catch (error) {
      console.error('Error creating user profile record:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });
      // Don't throw the error, just log it so it doesn't break the signup flow
    }
  };

  // Check if user is already signed in
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUser(user);
        setStep('pricing');
      }
    });
    return unsubscribe;
  }, []);

  // Google sign in handler
  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      console.log('Starting Google signup...');
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      console.log('Google signup successful:', result.user.email);
      console.log('Auth state after Google signup:', auth.currentUser ? auth.currentUser.email : 'null');
      
      setUser(result.user);
      
      // Create subscription record immediately after user creation
      console.log('Creating subscription record...');
      await createSubscriptionRecord(result.user.uid, result.user.email || '');
      
      // Create user profile record
      console.log('Creating user profile record...');
      await createUserProfileRecord(result.user.uid, result.user.email || '');
      
      console.log('Auth state after creating records:', auth.currentUser ? auth.currentUser.email : 'null');
      console.log('Moving to pricing step...');
      
      // Track successful signup
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', 'sign_up', {
          method: 'google',
          custom_parameter: 'google_signup'
        });
      }
      
      // Add a final check to ensure user is still signed in
      setTimeout(() => {
        console.log('Final auth state check:', auth.currentUser ? auth.currentUser.email : 'null');
        if (!auth.currentUser) {
          console.error('User was signed out during the signup process!');
        }
      }, 2000);
      
      setStep('pricing');
    } catch (err: unknown) {
      console.error('Google signup error:', err);
      const errorMessage = err instanceof Error ? err.message : "Google sign in failed";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Email sign up handler
  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords don't match");
      setLoading(false);
      return;
    }

    try {
      console.log('Starting email signup...');
      const result = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      console.log('Email signup successful:', result.user.email);
      console.log('Auth state after email signup:', auth.currentUser ? auth.currentUser.email : 'null');
      
      setUser(result.user);
      
      // Create subscription record immediately after user creation
      console.log('Creating subscription record...');
      await createSubscriptionRecord(result.user.uid, result.user.email || '');
      
      // Create user profile record
      console.log('Creating user profile record...');
      await createUserProfileRecord(result.user.uid, result.user.email || '');
      
      console.log('Auth state after creating records:', auth.currentUser ? auth.currentUser.email : 'null');
      console.log('Moving to pricing step...');
      
      // Track successful signup
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', 'sign_up', {
          method: 'email',
          custom_parameter: 'email_signup'
        });
      }
      
      // Add a final check to ensure user is still signed in
      setTimeout(() => {
        console.log('Final auth state check:', auth.currentUser ? auth.currentUser.email : 'null');
        if (!auth.currentUser) {
          console.error('User was signed out during the signup process!');
        }
      }, 2000);
      
      setStep('pricing');
    } catch (err: unknown) {
      console.error('Email signup error:', err);
      const errorMessage = err instanceof Error ? err.message : "Email sign up failed";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Handle plan selection and redirect to Stripe checkout
  const handlePlanSelect = async (planType: 'monthly' | 'yearly') => {
    if (!user) return;

    setLoading(true);
    setError("");

    try {
      console.log('Creating checkout session for plan:', planType);
      
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.uid,
          email: user.email,
          planType,
        }),
      });

      const data = await response.json();
      console.log('Checkout session response:', data);

      if (data.error) {
        setError(data.error);
        return;
      }

      if (!data.sessionId) {
        setError('No session ID received from server');
        return;
      }

      // Redirect to Stripe Checkout
      console.log('Loading Stripe...');
      const stripe = await getStripe();
      
      if (!stripe) {
        setError('Failed to load Stripe. Please check your internet connection and try again.');
        return;
      }

      console.log('Redirecting to Stripe checkout with session:', data.sessionId);
      const { error } = await stripe.redirectToCheckout({ sessionId: data.sessionId });
      
      if (error) {
        console.error('Stripe redirect error:', error);
        setError(error.message || 'Failed to redirect to checkout');
      } else {
        console.log('Stripe redirect successful');
        // Simulate setting the cookie after successful checkout (in production, set this after webhook)
        setCookie('hasActiveSubscription', '1', { path: '/' });
      }
    } catch (error) {
      console.error('Error in handlePlanSelect:', error);
      setError('Failed to create checkout session. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  // Render different steps
  if (step === 'pricing') {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Welcome to Agent Money Tracker</h1>
            <p className="text-gray-600 text-lg">Complete your account setup by choosing a plan</p>
          </div>
          
          <PricingPlans onPlanSelect={handlePlanSelect} loading={loading} />
          
          {error && (
            <div className="mt-8 text-center">
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm max-w-md mx-auto">
                {error}
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  // Account creation step
  return (
    <main className="flex flex-col items-center justify-center min-h-[80vh] px-4">
      <div className="bg-white rounded-xl shadow p-6 w-full max-w-sm">
        <h2 className="text-2xl font-bold mb-2 text-center text-blue-700">Create Your Free Account</h2>
        <p className="text-gray-600 text-center mb-4">Start tracking your deals, commissions, and expenses in seconds.</p>
        
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 py-2 rounded-lg font-semibold shadow hover:bg-gray-50 transition mb-4 disabled:opacity-60"
        >
          <svg className="w-5 h-5" viewBox="0 0 48 48"><g><path fill="#4285F4" d="M24 9.5c3.54 0 6.7 1.22 9.19 3.23l6.85-6.85C35.64 2.36 30.18 0 24 0 14.82 0 6.71 5.48 2.69 13.44l7.98 6.2C12.13 13.13 17.62 9.5 24 9.5z"/><path fill="#34A853" d="M46.1 24.55c0-1.64-.15-3.22-.43-4.74H24v9.01h12.42c-.54 2.9-2.18 5.36-4.65 7.02l7.18 5.59C43.93 37.13 46.1 31.36 46.1 24.55z"/><path fill="#FBBC05" d="M10.67 28.65c-1.01-2.99-1.01-6.21 0-9.2l-7.98-6.2C.9 17.1 0 20.43 0 24c0 3.57.9 6.9 2.69 10.55l7.98-6.2z"/><path fill="#EA4335" d="M24 48c6.18 0 11.36-2.05 15.14-5.57l-7.18-5.59c-2.01 1.35-4.59 2.15-7.96 2.15-6.38 0-11.87-3.63-14.33-8.89l-7.98 6.2C6.71 42.52 14.82 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></g></svg>
          Continue with Google
        </button>
        
        {error && <div className="text-red-600 text-sm mb-2 text-center">{error}</div>}
        
        <div className="relative mb-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">Or continue with email</span>
          </div>
        </div>
        
        <form onSubmit={handleEmailSignup} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
              autoComplete="email"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleInputChange}
              autoComplete="new-password"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              autoComplete="new-password"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold shadow hover:bg-blue-700 transition text-lg disabled:opacity-60"
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>
        
        <div className="text-center mt-4 text-sm text-gray-600">
          Already have an account?{' '}
          <Link href="/signin" className="text-blue-700 font-semibold hover:underline">Sign In</Link>
        </div>
      </div>
    </main>
  );
} 