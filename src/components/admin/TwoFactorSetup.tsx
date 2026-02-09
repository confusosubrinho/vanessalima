import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Shield, ShieldCheck, ShieldOff, QrCode, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function TwoFactorSetup() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const [enrolledFactorId, setEnrolledFactorId] = useState<string | null>(null);

  const checkStatus = async () => {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors?.totp?.[0];
    if (totp && totp.status === 'verified') {
      setIsEnabled(true);
      setEnrolledFactorId(totp.id);
    } else {
      setIsEnabled(false);
    }
  };

  // Check on mount
  useState(() => {
    checkStatus();
  });

  const handleEnroll = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Google Authenticator',
      });
      if (error) throw error;

      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
    } catch (err: any) {
      toast({ title: 'Erro ao configurar 2FA', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyAndActivate = async () => {
    if (!factorId || verifyCode.length !== 6) return;
    setIsLoading(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: verifyCode,
      });

      if (verifyError) {
        toast({ title: 'Código inválido', description: 'Tente novamente', variant: 'destructive' });
        setVerifyCode('');
        return;
      }

      toast({ title: '2FA ativado com sucesso!', description: 'Sua conta está mais segura agora.' });
      setQrCode(null);
      setSecret(null);
      setFactorId(null);
      setVerifyCode('');
      setIsEnabled(true);
      setEnrolledFactorId(factorId);
    } catch (err: any) {
      toast({ title: 'Erro na verificação', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisable = async () => {
    if (!enrolledFactorId) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({
        factorId: enrolledFactorId,
      });
      if (error) throw error;

      toast({ title: '2FA desativado' });
      setIsEnabled(false);
      setEnrolledFactorId(null);
    } catch (err: any) {
      toast({ title: 'Erro ao desativar', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Autenticação de 2 Fatores (2FA)
        </CardTitle>
        <CardDescription>
          Proteja sua conta com verificação por aplicativo autenticador (Google Authenticator, Authy, etc.)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
          {isEnabled ? (
            <>
              <ShieldCheck className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium">2FA está ativo</span>
              <Badge variant="outline" className="ml-auto text-green-600 border-green-600">Ativo</Badge>
            </>
          ) : (
            <>
              <ShieldOff className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">2FA não configurado</span>
              <Badge variant="outline" className="ml-auto">Inativo</Badge>
            </>
          )}
        </div>

        {/* QR Code enrollment */}
        {qrCode && (
          <div className="space-y-4 border rounded-lg p-4">
            <div className="text-center space-y-3">
              <p className="text-sm font-medium">1. Escaneie o QR Code com o Google Authenticator:</p>
              <div className="flex justify-center">
                <img src={qrCode} alt="QR Code 2FA" className="w-48 h-48 rounded-lg border" />
              </div>
              <div className="text-xs text-muted-foreground">
                <p>Ou insira o código manualmente:</p>
                <code className="bg-muted px-2 py-1 rounded text-xs break-all select-all">
                  {secret}
                </code>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">2. Digite o código de 6 dígitos gerado:</p>
              <div className="flex gap-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerifyAndActivate()}
                  className="text-center text-xl tracking-[0.5em] font-mono"
                />
                <Button 
                  onClick={handleVerifyAndActivate} 
                  disabled={isLoading || verifyCode.length !== 6}
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ativar'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        {!qrCode && (
          <div className="flex gap-2">
            {isEnabled ? (
              <Button variant="destructive" onClick={handleDisable} disabled={isLoading}>
                <ShieldOff className="h-4 w-4 mr-2" />
                {isLoading ? 'Desativando...' : 'Desativar 2FA'}
              </Button>
            ) : (
              <Button onClick={handleEnroll} disabled={isLoading}>
                <QrCode className="h-4 w-4 mr-2" />
                {isLoading ? 'Configurando...' : 'Configurar 2FA'}
              </Button>
            )}
          </div>
        )}

        {/* Security tips */}
        <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">🔒 Dicas de segurança:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Salve os códigos de backup em local seguro</li>
            <li>Use o Google Authenticator ou Authy no celular</li>
            <li>Nunca compartilhe o código QR ou a chave secreta</li>
            <li>Se perder acesso ao autenticador, entre em contato com o suporte</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
