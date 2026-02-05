 import { useState, useEffect } from 'react';
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
 import logo from '@/assets/logo.png';
 
 const loginSchema = z.object({
   email: z.string().email('Email inválido'),
   password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
 });
 
 type LoginFormData = z.infer<typeof loginSchema>;
 
 export default function AdminLogin() {
   const navigate = useNavigate();
   const { toast } = useToast();
   const [isLoading, setIsLoading] = useState(false);
 
   const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>({
     resolver: zodResolver(loginSchema),
   });
 
   useEffect(() => {
     checkExistingSession();
   }, []);
 
   const checkExistingSession = async () => {
     const { data: { session } } = await supabase.auth.getSession();
     if (session) {
       const { data: roles } = await supabase
         .from('user_roles')
         .select('role')
         .eq('user_id', session.user.id)
         .eq('role', 'admin');
 
       if (roles && roles.length > 0) {
         navigate('/admin');
       }
     }
   };
 
   const onSubmit = async (data: LoginFormData) => {
     setIsLoading(true);
     try {
       const { data: authData, error } = await supabase.auth.signInWithPassword({
         email: data.email,
         password: data.password,
       });
 
       if (error) {
         toast({ title: 'Credenciais inválidas', variant: 'destructive' });
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
         toast({ title: 'Acesso negado. Você não é administrador.', variant: 'destructive' });
         return;
       }
 
       navigate('/admin');
     } finally {
       setIsLoading(false);
     }
   };
 
   return (
     <div className="min-h-screen flex items-center justify-center bg-sidebar px-4">
       <Card className="w-full max-w-md">
         <CardHeader className="text-center">
           <img src={logo} alt="Vanessa Lima Shoes" className="h-12 mx-auto mb-4" />
           <CardTitle>Painel Administrativo</CardTitle>
           <CardDescription>Faça login para acessar</CardDescription>
         </CardHeader>
         <CardContent>
           <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
             <div>
               <Label htmlFor="email">Email</Label>
               <Input
                 id="email"
                 type="email"
                 {...register('email')}
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
               />
               {errors.password && (
                 <p className="text-sm text-destructive mt-1">{errors.password.message}</p>
               )}
             </div>
             <Button type="submit" className="w-full" disabled={isLoading}>
               {isLoading ? 'Entrando...' : 'Entrar'}
             </Button>
           </form>
           <div className="mt-4 text-center">
             <Link to="/" className="text-sm text-muted-foreground hover:text-primary">
               ← Voltar para a loja
             </Link>
           </div>
         </CardContent>
       </Card>
     </div>
   );
 }