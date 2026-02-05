 import { useState, useEffect } from 'react';
 import { useNavigate } from 'react-router-dom';
 import { z } from 'zod';
 import { useForm } from 'react-hook-form';
 import { zodResolver } from '@hookform/resolvers/zod';
 import { supabase } from '@/integrations/supabase/client';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Label } from '@/components/ui/label';
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
 import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
 import { useToast } from '@/hooks/use-toast';
 import logo from '@/assets/logo.png';
 
 const loginSchema = z.object({
   email: z.string().email('Email inválido'),
   password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
 });
 
 const signupSchema = z.object({
   name: z.string().min(2, 'O nome deve ter no mínimo 2 caracteres'),
   email: z.string().email('Email inválido'),
   password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
   confirmPassword: z.string(),
 }).refine((data) => data.password === data.confirmPassword, {
   message: 'As senhas não coincidem',
   path: ['confirmPassword'],
 });
 
 type LoginFormData = z.infer<typeof loginSchema>;
 type SignupFormData = z.infer<typeof signupSchema>;
 
 export default function Auth() {
   const navigate = useNavigate();
   const { toast } = useToast();
   const [isLoading, setIsLoading] = useState(false);
 
   const loginForm = useForm<LoginFormData>({
     resolver: zodResolver(loginSchema),
   });
 
   const signupForm = useForm<SignupFormData>({
     resolver: zodResolver(signupSchema),
   });
 
   useEffect(() => {
     const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
       if (session?.user) {
         navigate('/');
       }
     });
 
     supabase.auth.getSession().then(({ data: { session } }) => {
       if (session?.user) {
         navigate('/');
       }
     });
 
     return () => subscription.unsubscribe();
   }, [navigate]);
 
   const handleLogin = async (data: LoginFormData) => {
     setIsLoading(true);
     try {
       const { error } = await supabase.auth.signInWithPassword({
         email: data.email,
         password: data.password,
       });
 
       if (error) {
         if (error.message.includes('Invalid login credentials')) {
           toast({ title: 'Email ou senha incorretos', variant: 'destructive' });
         } else if (error.message.includes('Email not confirmed')) {
           toast({ title: 'Confirme seu email antes de fazer login', variant: 'destructive' });
         } else {
           toast({ title: error.message, variant: 'destructive' });
         }
       }
     } finally {
       setIsLoading(false);
     }
   };
 
   const handleSignup = async (data: SignupFormData) => {
     setIsLoading(true);
     try {
       const redirectUrl = `${window.location.origin}/`;
 
       const { error } = await supabase.auth.signUp({
         email: data.email,
         password: data.password,
         options: {
           emailRedirectTo: redirectUrl,
           data: {
             full_name: data.name,
           },
         },
       });
 
       if (error) {
         if (error.message.includes('already registered')) {
           toast({ title: 'Este email já está cadastrado', variant: 'destructive' });
         } else {
           toast({ title: error.message, variant: 'destructive' });
         }
       } else {
         toast({
           title: 'Cadastro realizado!',
           description: 'Verifique seu email para confirmar a conta.',
         });
       }
     } finally {
       setIsLoading(false);
     }
   };
 
   return (
     <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
       <Card className="w-full max-w-md">
         <CardHeader className="text-center">
           <img src={logo} alt="Vanessa Lima Shoes" className="h-12 mx-auto mb-4" />
           <CardTitle>Bem-vinda!</CardTitle>
           <CardDescription>Entre ou crie sua conta</CardDescription>
         </CardHeader>
         <CardContent>
           <Tabs defaultValue="login">
             <TabsList className="grid w-full grid-cols-2">
               <TabsTrigger value="login">Entrar</TabsTrigger>
               <TabsTrigger value="signup">Cadastrar</TabsTrigger>
             </TabsList>
 
             <TabsContent value="login" className="mt-4">
               <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                 <div>
                   <Label htmlFor="login-email">Email</Label>
                   <Input
                     id="login-email"
                     type="email"
                     {...loginForm.register('email')}
                   />
                   {loginForm.formState.errors.email && (
                     <p className="text-sm text-destructive mt-1">
                       {loginForm.formState.errors.email.message}
                     </p>
                   )}
                 </div>
                 <div>
                   <Label htmlFor="login-password">Senha</Label>
                   <Input
                     id="login-password"
                     type="password"
                     {...loginForm.register('password')}
                   />
                   {loginForm.formState.errors.password && (
                     <p className="text-sm text-destructive mt-1">
                       {loginForm.formState.errors.password.message}
                     </p>
                   )}
                 </div>
                 <Button type="submit" className="w-full" disabled={isLoading}>
                   {isLoading ? 'Entrando...' : 'Entrar'}
                 </Button>
               </form>
             </TabsContent>
 
             <TabsContent value="signup" className="mt-4">
               <form onSubmit={signupForm.handleSubmit(handleSignup)} className="space-y-4">
                 <div>
                   <Label htmlFor="signup-name">Nome completo</Label>
                   <Input
                     id="signup-name"
                     type="text"
                     {...signupForm.register('name')}
                   />
                   {signupForm.formState.errors.name && (
                     <p className="text-sm text-destructive mt-1">
                       {signupForm.formState.errors.name.message}
                     </p>
                   )}
                 </div>
                 <div>
                   <Label htmlFor="signup-email">Email</Label>
                   <Input
                     id="signup-email"
                     type="email"
                     {...signupForm.register('email')}
                   />
                   {signupForm.formState.errors.email && (
                     <p className="text-sm text-destructive mt-1">
                       {signupForm.formState.errors.email.message}
                     </p>
                   )}
                 </div>
                 <div>
                   <Label htmlFor="signup-password">Senha</Label>
                   <Input
                     id="signup-password"
                     type="password"
                     {...signupForm.register('password')}
                   />
                   {signupForm.formState.errors.password && (
                     <p className="text-sm text-destructive mt-1">
                       {signupForm.formState.errors.password.message}
                     </p>
                   )}
                 </div>
                 <div>
                   <Label htmlFor="signup-confirm">Confirmar senha</Label>
                   <Input
                     id="signup-confirm"
                     type="password"
                     {...signupForm.register('confirmPassword')}
                   />
                   {signupForm.formState.errors.confirmPassword && (
                     <p className="text-sm text-destructive mt-1">
                       {signupForm.formState.errors.confirmPassword.message}
                     </p>
                   )}
                 </div>
                 <Button type="submit" className="w-full" disabled={isLoading}>
                   {isLoading ? 'Cadastrando...' : 'Cadastrar'}
                 </Button>
               </form>
             </TabsContent>
           </Tabs>
         </CardContent>
       </Card>
     </div>
   );
 }