import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Shield, Lock, AlertTriangle } from 'lucide-react';
import { useStoreSettings } from '@/hooks/useProducts';
import logoFallback from '@/assets/logo.png';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
});

type LoginFormData = z.infer<typeof loginSchema>;

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export default function AdminLogin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: storeSettings } = useStoreSettings();
  const logoSrc = storeSettings?.header_logo_url || storeSettings?.logo_url || logoFallback;
  const storeName = storeSettings?.store_name || 'Painel Administrativo';
  const [isLoading, setIsLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<Date | null>(null);
  const [lockoutCountdown, setLockoutCountdown] = useState('');
  const [showTOTP, setShowTOTP] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const totpInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    checkExistingSession();
  }, []);

  // Lockout countdown timer
  useEffect(() => {
    if (!lockoutUntil) return;
    const interval = setInterval(() => {
      const now = new Date();
      const diff = lockoutUntil.getTime() - now.getTime();
      if (diff <= 0) {
        setLockoutUntil(null);
        setLockoutCountdown('');
        setFailedAttempts(0);
        clearInterval(interval);
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setLockoutCountdown(`${mins}:${secs.toString().padStart(2, '0')}`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  const checkExistingSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .eq('role', 'admin');

      if (roles && roles.length > 0) {
        // Check if MFA is enrolled, verify if needed
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const totp = factors?.totp?.[0];
        if (totp && totp.status === 'verified') {
          const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          if (aal?.currentLevel === 'aal1') {
            // Need 2FA verification
            setPendingFactorId(totp.id);
            setShowTOTP(true);
            return;
          }
        }
        navigate('/admin');
      }
    }
  };

  const logLoginAttempt = async (email: string, success: boolean) => {
    try {
      await supabase.from('login_attempts').insert({
        email: email.toLowerCase(),
        success,
      });
    } catch { /* silent */ }
  };

  const onSubmit = async (data: LoginFormData) => {
    // Check lockout
    if (lockoutUntil && new Date() < lockoutUntil) {
      toast({ title: 'Conta bloqueada temporariamente', description: `Tente novamente em ${lockoutCountdown}`, variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        const newAttempts = failedAttempts + 1;
        setFailedAttempts(newAttempts);
        await logLoginAttempt(data.email, false);

        if (newAttempts >= MAX_ATTEMPTS) {
          const lockout = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
          setLockoutUntil(lockout);
          toast({ title: `Muitas tentativas. Bloqueado por ${LOCKOUT_MINUTES} minutos.`, variant: 'destructive' });
        } else {
          toast({ 
            title: 'Credenciais inválidas', 
            description: `${MAX_ATTEMPTS - newAttempts} tentativas restantes`,
            variant: 'destructive' 
          });
        }
        return;
      }

      // Check if user is admin
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', authData.user.id)
        .eq('role', 'admin');

      if (!roles || roles.length === 0) {
        await supabase.auth.signOut();
        await logLoginAttempt(data.email, false);
        toast({ title: 'Acesso negado. Você não é administrador.', variant: 'destructive' });
        return;
      }

      await logLoginAttempt(data.email, true);
      setFailedAttempts(0);

      // Check for MFA
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.[0];
      if (totp && totp.status === 'verified') {
        setPendingFactorId(totp.id);
        setShowTOTP(true);
        setTimeout(() => totpInputRef.current?.focus(), 100);
        return;
      }

      navigate('/admin');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTOTPVerify = async () => {
    if (!pendingFactorId || totpCode.length !== 6) return;
    setIsLoading(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: pendingFactorId,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: pendingFactorId,
        challengeId: challenge.id,
        code: totpCode,
      });

      if (verifyError) {
        toast({ title: 'Código inválido', description: 'Verifique o código no seu autenticador', variant: 'destructive' });
        setTotpCode('');
        return;
      }

      navigate('/admin');
    } catch (err: any) {
      toast({ title: 'Erro na verificação', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const isLocked = lockoutUntil && new Date() < lockoutUntil;

  return (
    <div className="min-h-screen flex items-center justify-center bg-sidebar px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src={logoSrc} alt={storeName} className="h-12 mx-auto mb-4 object-contain max-w-[200px]" />
          <CardTitle className="flex items-center justify-center gap-2">
            <Shield className="h-5 w-5" />
            Painel Administrativo
          </CardTitle>
          <CardDescription>
            {showTOTP ? 'Verificação em duas etapas' : 'Faça login para acessar'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLocked && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
              <p className="text-sm text-destructive">
                Bloqueado por excesso de tentativas. Aguarde <strong>{lockoutCountdown}</strong>
              </p>
            </div>
          )}

          {showTOTP ? (
            <div className="space-y-4">
              <div className="text-center">
                <Lock className="h-12 w-12 mx-auto text-primary mb-3" />
                <p className="text-sm text-muted-foreground">
                  Digite o código de 6 dígitos do seu aplicativo autenticador (Google Authenticator)
                </p>
              </div>
              <div>
                <Label htmlFor="totp">Código de verificação</Label>
                <Input
                  ref={totpInputRef}
                  id="totp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => e.key === 'Enter' && handleTOTPVerify()}
                  className="text-center text-2xl tracking-[0.5em] font-mono"
                />
              </div>
              <Button 
                className="w-full" 
                onClick={handleTOTPVerify} 
                disabled={isLoading || totpCode.length !== 6}
              >
                {isLoading ? 'Verificando...' : 'Verificar'}
              </Button>
              <Button 
                variant="ghost" 
                className="w-full" 
                onClick={() => { setShowTOTP(false); setTotpCode(''); }}
              >
                Voltar ao login
              </Button>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    {...register('email')}
                    disabled={!!isLocked}
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive mt-1">{errors.email.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    {...register('password')}
                    disabled={!!isLocked}
                  />
                  {errors.password && (
                    <p className="text-sm text-destructive mt-1">{errors.password.message}</p>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={isLoading || !!isLocked}>
                  {isLoading ? 'Entrando...' : 'Entrar'}
                </Button>
              </form>

              {failedAttempts > 0 && !isLocked && (
                <p className="mt-2 text-xs text-center text-muted-foreground">
                  {MAX_ATTEMPTS - failedAttempts} tentativas restantes antes do bloqueio
                </p>
              )}

              <div className="mt-4 text-center">
                <Link to="/" className="text-sm text-muted-foreground hover:text-primary">
                  ← Voltar para a loja
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
