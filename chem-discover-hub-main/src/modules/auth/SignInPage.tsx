import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Atom, ShieldCheck, Mail, Lock, User, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ApiErrorBanner } from '@/components/common/ApiErrorBanner';
import { cn } from '@/lib/utils';

const signInSchema = z.object({
  email: z.string().trim().email('Invalid email').max(255),
  password: z.string().min(6, 'Min 6 characters').max(100),
});
const signUpSchema = signInSchema.extend({
  displayName: z.string().trim().min(1, 'Required').max(100),
});

function MolecularBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden overflow-hidden bg-[#f5f5f7]" aria-hidden="true">
      <svg className="h-full w-full opacity-[0.12]" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Animated clusters */}
        <g className="animate-drift" style={{ animationDuration: '25s' }}>
          <circle cx="150" cy="200" r="4" fill="var(--primary)" filter="url(#glow)" />
          <circle cx="220" cy="180" r="3" fill="var(--primary)" />
          <circle cx="280" cy="240" r="5" fill="var(--primary)" filter="url(#glow)" />
          <line x1="150" y1="200" x2="220" y2="180" stroke="var(--primary)" strokeWidth="1" strokeOpacity="0.4" />
          <line x1="220" y1="180" x2="280" y2="240" stroke="var(--primary)" strokeWidth="1" strokeOpacity="0.4" />
        </g>

        <g className="animate-drift" style={{ animationDuration: '35s', animationDelay: '-5s', animationDirection: 'reverse' }}>
          <circle cx="800" cy="700" r="4" fill="var(--primary)" filter="url(#glow)" />
          <circle cx="880" cy="650" r="3" fill="var(--primary)" />
          <circle cx="750" cy="620" r="5" fill="var(--primary)" filter="url(#glow)" />
          <line x1="800" y1="700" x2="880" y2="650" stroke="var(--primary)" strokeWidth="1" strokeOpacity="0.4" />
          <line x1="880" y1="650" x2="750" y2="620" stroke="var(--primary)" strokeWidth="1" strokeOpacity="0.4" />
        </g>

        <g className="animate-drift" style={{ animationDuration: '45s', animationDelay: '-15s' }}>
          <circle cx="500" cy="100" r="3" fill="var(--primary)" />
          <circle cx="580" cy="150" r="4" fill="var(--primary)" filter="url(#glow)" />
          <circle cx="450" cy="180" r="2" fill="var(--primary)" />
          <line x1="500" y1="100" x2="580" y2="150" stroke="var(--primary)" strokeWidth="1" strokeOpacity="0.3" />
          <line x1="580" y1="150" x2="450" y2="180" stroke="var(--primary)" strokeWidth="1" strokeOpacity="0.3" />
        </g>
      </svg>
    </div>
  );
}

function FloatingInput({ 
  label, 
  id, 
  error, 
  icon: Icon, 
  type = 'text', 
  register,
  autoComplete
}: { 
  label: string; 
  id: string; 
  error?: string; 
  icon: any; 
  type?: string; 
  register: any;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="auth-input-glow floating-label-group relative flex items-center rounded-xl border bg-white/50 transition-all focus-within:border-primary/50 focus-within:bg-white focus-within:ring-4 focus-within:ring-primary/10">
        <Icon className="ml-4 size-4.5 text-muted-foreground/60" />
        <input
          id={id}
          type={type}
          placeholder=" "
          autoComplete={autoComplete}
          className="peer w-full bg-transparent pl-12 pr-4 py-4 text-sm outline-none placeholder:text-transparent"
          {...register}
        />
        <label 
          htmlFor={id} 
          className="pointer-events-none absolute left-11 top-4 text-sm text-muted-foreground/60 transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-muted-foreground/60 peer-focus:top-[-10px] peer-focus:left-10 peer-focus:text-xs peer-focus:font-medium peer-focus:text-primary peer-[:not(:placeholder-shown)]:top-[-10px] peer-[:not(:placeholder-shown)]:left-10 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:font-medium"
        >
          {label}
        </label>
      </div>
      {error && <p className="ml-1 text-[11px] font-medium text-destructive animate-in fade-in slide-in-from-top-1">{error}</p>}
    </div>
  );
}

export function SignInPage() {
  const navigate = useNavigate();
  const { signIn, signUp, resetPassword } = useAuthStore();
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');

  const signInForm = useForm({ resolver: zodResolver(signInSchema), defaultValues: { email: '', password: '' } });
  const signUpForm = useForm({ resolver: zodResolver(signUpSchema), defaultValues: { email: '', password: '', displayName: '' } });
  const [resetEmail, setResetEmail] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [authError, setAuthError] = useState<unknown>(null);

  const onSignIn = signInForm.handleSubmit(async (v) => {
    setAuthError(null);
    try { await signIn(v.email, v.password); navigate({ to: '/research' }); }
    catch (e: any) { setAuthError(e); toast.error(e.message || 'Sign in failed'); }
  });
  const onSignUp = signUpForm.handleSubmit(async (v) => {
    setAuthError(null);
    try { await signUp(v.email, v.password, v.displayName); toast.success('Account created'); navigate({ to: '/research' }); }
    catch (e: any) { setAuthError(e); toast.error(e.message || 'Sign up failed'); }
  });
  const onReset = async () => {
    try { await resetPassword(resetEmail); toast.success('Reset email sent'); setResetOpen(false); }
    catch (e: any) { toast.error(e.message || 'Failed'); }
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden font-sans selection:bg-primary/10 selection:text-primary">
      <MolecularBackground />
      
      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 items-center p-8">
        <div className="flex w-full flex-col items-center gap-16 lg:flex-row lg:items-center lg:justify-between">
          
          {/* Left Side: Auth Card */}
          <div className="w-full max-w-[440px] animate-in fade-in slide-in-from-left-8 duration-700">
            <div className="mb-10 flex flex-col items-center lg:items-start">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:scale-105 active:scale-95">
                <Atom className="size-7" />
              </div>
              <h2 className="mt-6 text-2xl font-semibold tracking-tight text-foreground/90">Welcome back</h2>
              <p className="mt-2 text-sm text-muted-foreground/80">Enter your credentials to access the workbench</p>
            </div>

            <div className="glass-panel relative rounded-[2rem] p-8">
              {Boolean(authError) && <div className="mb-6"><ApiErrorBanner error={authError} title="Authentication failed" /></div>}
              
              <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
                <TabsList className="relative mb-8 grid w-full grid-cols-2 bg-transparent p-0">
                  <TabsTrigger 
                    value="signin" 
                    className="relative z-10 py-3 text-sm font-medium transition-colors data-[state=inactive]:text-muted-foreground/60 data-[state=active]:text-primary"
                  >
                    Sign in
                  </TabsTrigger>
                  <TabsTrigger 
                    value="signup" 
                    className="relative z-10 py-3 text-sm font-medium transition-colors data-[state=inactive]:text-muted-foreground/60 data-[state=active]:text-primary"
                  >
                    Sign up
                  </TabsTrigger>
                  {/* Custom animated underline */}
                  <div 
                    className="tab-underline absolute bottom-0 w-1/2" 
                    style={{ left: tab === 'signin' ? '0%' : '50%' }}
                  />
                </TabsList>

                <TabsContent value="signin" className="mt-0 focus-visible:outline-none">
                  <form onSubmit={onSignIn} className="space-y-6">
                    <FloatingInput 
                      id="si-email" 
                      label="Email address" 
                      icon={Mail} 
                      type="email" 
                      autoComplete="email"
                      register={signInForm.register('email')}
                      error={signInForm.formState.errors.email?.message}
                    />
                    <div className="space-y-1">
                      <FloatingInput 
                        id="si-pw" 
                        label="Password" 
                        icon={Lock} 
                        type="password" 
                        autoComplete="current-password"
                        register={signInForm.register('password')}
                        error={signInForm.formState.errors.password?.message}
                      />
                      <div className="flex justify-end pr-1">
                        <Dialog open={resetOpen} onOpenChange={setResetOpen}>
                          <DialogTrigger asChild>
                            <button type="button" className="text-[11px] font-medium text-primary/70 hover:text-primary hover:underline">Forgot password?</button>
                          </DialogTrigger>
                          <DialogContent className="glass-panel border-none sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle>Reset password</DialogTitle>
                              <DialogDescription>Enter your email and we'll send you a recovery link.</DialogDescription>
                            </DialogHeader>
                            <div className="mt-4 space-y-4">
                              <Input 
                                type="email" 
                                placeholder="name@institute.org" 
                                className="rounded-xl border-muted/30 bg-white/50 py-6"
                                value={resetEmail} 
                                onChange={(e) => setResetEmail(e.target.value)} 
                              />
                              <Button onClick={onReset} className="btn-shimmer h-12 w-full rounded-xl bg-primary text-sm font-medium shadow-lg shadow-primary/20">
                                Send reset link
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                    <Button 
                      type="submit" 
                      className="btn-shimmer h-13 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
                      disabled={signInForm.formState.isSubmitting}
                    >
                      {signInForm.formState.isSubmitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : 'Sign in to ChemBrain'}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="signup" className="mt-0 focus-visible:outline-none">
                  <form onSubmit={onSignUp} className="space-y-6">
                    <FloatingInput 
                      id="su-name" 
                      label="Full name" 
                      icon={User} 
                      register={signUpForm.register('displayName')}
                      error={signUpForm.formState.errors.displayName?.message}
                    />
                    <FloatingInput 
                      id="su-email" 
                      label="Institutional Email" 
                      icon={Mail} 
                      type="email" 
                      register={signUpForm.register('email')}
                      error={signUpForm.formState.errors.email?.message}
                    />
                    <FloatingInput 
                      id="su-pw" 
                      label="Create password" 
                      icon={Lock} 
                      type="password" 
                      register={signUpForm.register('password')}
                      error={signUpForm.formState.errors.password?.message}
                    />
                    <Button 
                      type="submit" 
                      className="btn-shimmer h-13 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
                      disabled={signUpForm.formState.isSubmitting}
                    >
                      {signUpForm.formState.isSubmitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : 'Create scientific account'}
                    </Button>
                    <p className="px-2 text-center text-[10px] leading-relaxed text-muted-foreground/60">
                      By creating an account, you agree to our research data-governance policies and computational validation protocols.
                    </p>
                  </form>
                </TabsContent>
              </Tabs>
            </div>
          </div>

          {/* Right Side: Large Typography */}
          <div className="hidden flex-1 animate-in fade-in slide-in-from-right-12 duration-1000 lg:block">
            <div className="text-right">
              <h1
                className="text-[clamp(4rem,12vw,14rem)] font-light leading-[0.85] tracking-tighter text-foreground"
                style={{ fontFamily: '"Space Grotesk", sans-serif' }}
              >
                <span className="block opacity-90">Chem</span>
                <span className="block font-semibold italic text-primary drop-shadow-sm">Brain</span>
              </h1>
              <div className="mt-12 flex justify-end">
                <div className="flex max-w-[320px] flex-col items-end gap-4 text-right">
                  <div className="h-px w-24 bg-primary/30" />
                  <p className="text-lg font-medium text-foreground/80">Accelerating discovery with computational precision.</p>
                  <p className="text-sm text-muted-foreground/60 leading-relaxed">
                    Integrated workbench for molecular dynamics, ligand-binding analysis, and narrative synthesis.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-muted/20 bg-white/40 py-6 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-8 text-[11px] text-muted-foreground/70 flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-confidence-high opacity-80" />
          <p className="max-w-3xl leading-relaxed">
            Research-grade platform. All experimental data subject to internal data-governance policy. 
            Outputs are computational predictions and not a substitute for laboratory validation or regulatory review. 
            © {new Date().getFullYear()} ChemBrain Research Group.
          </p>
        </div>
      </footer>
    </div>
  );
}
