 import { useState, useEffect } from 'react';
 import { useNavigate, Link } from 'react-router-dom';
 import { Check, ChevronRight, Truck, CreditCard, MapPin, ArrowLeft } from 'lucide-react';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Label } from '@/components/ui/label';
 import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
 import { useCart } from '@/contexts/CartContext';
 import { useToast } from '@/hooks/use-toast';
 import logo from '@/assets/logo.png';
 
 type Step = 'identification' | 'shipping' | 'payment';
 
 export default function Checkout() {
   const navigate = useNavigate();
   const { items, subtotal, clearCart } = useCart();
   const { toast } = useToast();
   const [currentStep, setCurrentStep] = useState<Step>('identification');
   const [isLoading, setIsLoading] = useState(false);
 
   // Form data
   const [formData, setFormData] = useState({
     email: '',
     name: '',
     phone: '',
     cpf: '',
     cep: '',
     address: '',
     number: '',
     complement: '',
     neighborhood: '',
     city: '',
     state: '',
     shippingMethod: 'standard',
     paymentMethod: 'pix',
   });
 
   const formatPrice = (price: number) => {
     return new Intl.NumberFormat('pt-BR', {
       style: 'currency',
       currency: 'BRL',
     }).format(price);
   };
 
   const steps = [
     { id: 'identification', label: 'Identificação', icon: MapPin },
     { id: 'shipping', label: 'Entrega', icon: Truck },
     { id: 'payment', label: 'Pagamento', icon: CreditCard },
   ];
 
   const currentStepIndex = steps.findIndex(s => s.id === currentStep);
 
   const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
     const { name, value } = e.target;
     setFormData(prev => ({ ...prev, [name]: value }));
   };
 
   const handleNextStep = () => {
     if (currentStep === 'identification') {
       if (!formData.email || !formData.name || !formData.phone) {
         toast({ title: 'Preencha todos os campos obrigatórios', variant: 'destructive' });
         return;
       }
       setCurrentStep('shipping');
     } else if (currentStep === 'shipping') {
       if (!formData.cep || !formData.address || !formData.number || !formData.city || !formData.state) {
         toast({ title: 'Preencha o endereço completo', variant: 'destructive' });
         return;
       }
       setCurrentStep('payment');
     }
   };
 
   const handleSubmit = async () => {
     setIsLoading(true);
     // Simulate order creation
     await new Promise(resolve => setTimeout(resolve, 2000));
     clearCart();
     toast({
       title: 'Pedido realizado com sucesso!',
       description: 'Você receberá um email com os detalhes do pedido.',
     });
     navigate('/pedido-confirmado');
     setIsLoading(false);
   };
 
   const shippingCost = subtotal >= 399 ? 0 : formData.shippingMethod === 'express' ? 25 : 15;
   const total = subtotal + shippingCost;
 
   if (items.length === 0) {
     return (
       <div className="min-h-screen flex items-center justify-center bg-muted/30">
         <div className="text-center">
           <h1 className="text-xl font-bold mb-2">Carrinho vazio</h1>
           <p className="text-muted-foreground mb-4">Adicione produtos para continuar</p>
           <Button asChild>
             <Link to="/">Voltar para a loja</Link>
           </Button>
         </div>
       </div>
     );
   }
 
   return (
     <div className="min-h-screen bg-muted/30">
       {/* Header */}
       <header className="bg-background border-b sticky top-0 z-50">
         <div className="container-custom py-4 flex items-center justify-between">
           <div className="flex items-center gap-4">
             <Button variant="ghost" size="icon" asChild>
               <Link to="/carrinho">
                 <ArrowLeft className="h-5 w-5" />
               </Link>
             </Button>
             <Link to="/">
               <img src={logo} alt="Vanessa Lima Shoes" className="h-8" />
             </Link>
           </div>
           <div className="text-sm text-muted-foreground">
             Compra 100% segura
           </div>
         </div>
       </header>
 
       {/* Progress steps */}
       <div className="bg-background border-b">
         <div className="container-custom py-4">
           <div className="flex items-center justify-center gap-4">
             {steps.map((step, index) => (
               <div key={step.id} className="flex items-center">
                 <button
                   onClick={() => index < currentStepIndex && setCurrentStep(step.id as Step)}
                   disabled={index > currentStepIndex}
                   className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors ${
                     currentStep === step.id
                       ? 'bg-primary text-primary-foreground'
                       : index < currentStepIndex
                       ? 'bg-primary/20 text-primary cursor-pointer'
                       : 'bg-muted text-muted-foreground'
                   }`}
                 >
                   {index < currentStepIndex ? (
                     <Check className="h-4 w-4" />
                   ) : (
                     <step.icon className="h-4 w-4" />
                   )}
                   <span className="hidden sm:inline font-medium">{step.label}</span>
                 </button>
                 {index < steps.length - 1 && (
                   <ChevronRight className="h-4 w-4 mx-2 text-muted-foreground" />
                 )}
               </div>
             ))}
           </div>
         </div>
       </div>
 
       {/* Main content */}
       <div className="container-custom py-8">
         <div className="grid lg:grid-cols-3 gap-8">
           {/* Form */}
           <div className="lg:col-span-2">
             <div className="bg-background rounded-lg p-6 shadow-sm">
               {/* Step 1: Identification */}
               {currentStep === 'identification' && (
                 <div className="space-y-6 animate-fade-in">
                   <h2 className="text-xl font-bold">Seus dados</h2>
                   
                   <div className="grid gap-4">
                     <div>
                       <Label htmlFor="email">Email *</Label>
                       <Input
                         id="email"
                         name="email"
                         type="email"
                         value={formData.email}
                         onChange={handleInputChange}
                         placeholder="seu@email.com"
                       />
                     </div>
                     <div className="grid md:grid-cols-2 gap-4">
                       <div>
                         <Label htmlFor="name">Nome completo *</Label>
                         <Input
                           id="name"
                           name="name"
                           value={formData.name}
                           onChange={handleInputChange}
                           placeholder="Seu nome"
                         />
                       </div>
                       <div>
                         <Label htmlFor="phone">Telefone *</Label>
                         <Input
                           id="phone"
                           name="phone"
                           value={formData.phone}
                           onChange={handleInputChange}
                           placeholder="(00) 00000-0000"
                         />
                       </div>
                     </div>
                     <div>
                       <Label htmlFor="cpf">CPF</Label>
                       <Input
                         id="cpf"
                         name="cpf"
                         value={formData.cpf}
                         onChange={handleInputChange}
                         placeholder="000.000.000-00"
                       />
                     </div>
                   </div>
 
                   <Button onClick={handleNextStep} className="w-full" size="lg">
                     Continuar para entrega
                     <ChevronRight className="h-4 w-4 ml-2" />
                   </Button>
                 </div>
               )}
 
               {/* Step 2: Shipping */}
               {currentStep === 'shipping' && (
                 <div className="space-y-6 animate-fade-in">
                   <h2 className="text-xl font-bold">Endereço de entrega</h2>
                   
                   <div className="grid gap-4">
                     <div className="grid md:grid-cols-3 gap-4">
                       <div>
                         <Label htmlFor="cep">CEP *</Label>
                         <Input
                           id="cep"
                           name="cep"
                           value={formData.cep}
                           onChange={handleInputChange}
                           placeholder="00000-000"
                         />
                       </div>
                     </div>
                     <div className="grid md:grid-cols-4 gap-4">
                       <div className="md:col-span-3">
                         <Label htmlFor="address">Endereço *</Label>
                         <Input
                           id="address"
                           name="address"
                           value={formData.address}
                           onChange={handleInputChange}
                           placeholder="Rua, Avenida..."
                         />
                       </div>
                       <div>
                         <Label htmlFor="number">Número *</Label>
                         <Input
                           id="number"
                           name="number"
                           value={formData.number}
                           onChange={handleInputChange}
                           placeholder="123"
                         />
                       </div>
                     </div>
                     <div className="grid md:grid-cols-2 gap-4">
                       <div>
                         <Label htmlFor="complement">Complemento</Label>
                         <Input
                           id="complement"
                           name="complement"
                           value={formData.complement}
                           onChange={handleInputChange}
                           placeholder="Apto, Bloco..."
                         />
                       </div>
                       <div>
                         <Label htmlFor="neighborhood">Bairro *</Label>
                         <Input
                           id="neighborhood"
                           name="neighborhood"
                           value={formData.neighborhood}
                           onChange={handleInputChange}
                           placeholder="Seu bairro"
                         />
                       </div>
                     </div>
                     <div className="grid md:grid-cols-2 gap-4">
                       <div>
                         <Label htmlFor="city">Cidade *</Label>
                         <Input
                           id="city"
                           name="city"
                           value={formData.city}
                           onChange={handleInputChange}
                           placeholder="Sua cidade"
                         />
                       </div>
                       <div>
                         <Label htmlFor="state">Estado *</Label>
                         <Input
                           id="state"
                           name="state"
                           value={formData.state}
                           onChange={handleInputChange}
                           placeholder="UF"
                           maxLength={2}
                         />
                       </div>
                     </div>
                   </div>
 
                   <div className="space-y-4">
                     <h3 className="font-medium">Método de envio</h3>
                     <RadioGroup
                       value={formData.shippingMethod}
                       onValueChange={(value) => setFormData(prev => ({ ...prev, shippingMethod: value }))}
                     >
                       <div className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:border-primary transition-colors">
                         <div className="flex items-center gap-3">
                           <RadioGroupItem value="standard" id="standard" />
                           <Label htmlFor="standard" className="cursor-pointer">
                             <span className="font-medium">Envio padrão</span>
                             <p className="text-sm text-muted-foreground">7-10 dias úteis</p>
                           </Label>
                         </div>
                         <span className="font-medium">{subtotal >= 399 ? 'Grátis' : formatPrice(15)}</span>
                       </div>
                       <div className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:border-primary transition-colors">
                         <div className="flex items-center gap-3">
                           <RadioGroupItem value="express" id="express" />
                           <Label htmlFor="express" className="cursor-pointer">
                             <span className="font-medium">Envio expresso</span>
                             <p className="text-sm text-muted-foreground">3-5 dias úteis</p>
                           </Label>
                         </div>
                         <span className="font-medium">{subtotal >= 399 ? formatPrice(10) : formatPrice(25)}</span>
                       </div>
                     </RadioGroup>
                   </div>
 
                   <Button onClick={handleNextStep} className="w-full" size="lg">
                     Continuar para pagamento
                     <ChevronRight className="h-4 w-4 ml-2" />
                   </Button>
                 </div>
               )}
 
               {/* Step 3: Payment */}
               {currentStep === 'payment' && (
                 <div className="space-y-6 animate-fade-in">
                   <h2 className="text-xl font-bold">Pagamento</h2>
 
                   <RadioGroup
                     value={formData.paymentMethod}
                     onValueChange={(value) => setFormData(prev => ({ ...prev, paymentMethod: value }))}
                     className="space-y-4"
                   >
                     <div className={`p-4 border rounded-lg cursor-pointer transition-colors ${formData.paymentMethod === 'pix' ? 'border-primary bg-primary/5' : 'hover:border-primary'}`}>
                       <div className="flex items-center gap-3">
                         <RadioGroupItem value="pix" id="pix" />
                         <Label htmlFor="pix" className="cursor-pointer flex-1">
                           <span className="font-medium">PIX</span>
                           <p className="text-sm text-muted-foreground">Pagamento instantâneo com 5% de desconto</p>
                         </Label>
                         <span className="font-bold text-primary">{formatPrice(total * 0.95)}</span>
                       </div>
                     </div>
                     <div className={`p-4 border rounded-lg cursor-pointer transition-colors ${formData.paymentMethod === 'card' ? 'border-primary bg-primary/5' : 'hover:border-primary'}`}>
                       <div className="flex items-center gap-3">
                         <RadioGroupItem value="card" id="card" />
                         <Label htmlFor="card" className="cursor-pointer flex-1">
                           <span className="font-medium">Cartão de Crédito</span>
                           <p className="text-sm text-muted-foreground">Em até 6x sem juros</p>
                         </Label>
                         <span className="font-medium">{formatPrice(total)}</span>
                       </div>
                     </div>
                     <div className={`p-4 border rounded-lg cursor-pointer transition-colors ${formData.paymentMethod === 'boleto' ? 'border-primary bg-primary/5' : 'hover:border-primary'}`}>
                       <div className="flex items-center gap-3">
                         <RadioGroupItem value="boleto" id="boleto" />
                         <Label htmlFor="boleto" className="cursor-pointer flex-1">
                           <span className="font-medium">Boleto Bancário</span>
                           <p className="text-sm text-muted-foreground">Vencimento em 3 dias úteis</p>
                         </Label>
                         <span className="font-medium">{formatPrice(total)}</span>
                       </div>
                     </div>
                   </RadioGroup>
 
                   <Button onClick={handleSubmit} className="w-full" size="lg" disabled={isLoading}>
                     {isLoading ? 'Processando...' : 'Finalizar Pedido'}
                   </Button>
                 </div>
               )}
             </div>
           </div>
 
           {/* Order summary */}
           <div className="lg:col-span-1">
             <div className="bg-background rounded-lg p-6 shadow-sm sticky top-32">
               <h2 className="font-bold text-lg mb-4">Resumo do Pedido</h2>
               
               <div className="space-y-3 max-h-[300px] overflow-y-auto mb-4">
                 {items.map((item) => (
                   <div key={item.variant.id} className="flex gap-3">
                     <img
                       src={item.product.images?.[0]?.url || '/placeholder.svg'}
                       alt={item.product.name}
                       className="w-16 h-16 object-cover rounded"
                     />
                     <div className="flex-1 text-sm">
                       <p className="font-medium line-clamp-1">{item.product.name}</p>
                       <p className="text-muted-foreground">Tam: {item.variant.size} | Qtd: {item.quantity}</p>
                       <p className="font-medium">{formatPrice(Number(item.product.sale_price || item.product.base_price) * item.quantity)}</p>
                     </div>
                   </div>
                 ))}
               </div>
 
               <div className="border-t pt-4 space-y-2">
                 <div className="flex justify-between text-sm">
                   <span className="text-muted-foreground">Subtotal</span>
                   <span>{formatPrice(subtotal)}</span>
                 </div>
                 <div className="flex justify-between text-sm">
                   <span className="text-muted-foreground">Frete</span>
                   <span className={shippingCost === 0 ? 'text-primary' : ''}>
                     {shippingCost === 0 ? 'Grátis' : formatPrice(shippingCost)}
                   </span>
                 </div>
                 {formData.paymentMethod === 'pix' && (
                   <div className="flex justify-between text-sm text-primary">
                     <span>Desconto PIX (5%)</span>
                     <span>-{formatPrice(total * 0.05)}</span>
                   </div>
                 )}
                 <div className="flex justify-between font-bold text-lg pt-2 border-t">
                   <span>Total</span>
                   <span>{formatPrice(formData.paymentMethod === 'pix' ? total * 0.95 : total)}</span>
                 </div>
               </div>
             </div>
           </div>
         </div>
       </div>
     </div>
   );
 }