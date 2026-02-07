import { useState } from 'react';
import { Truck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCart } from '@/contexts/CartContext';
import { ShippingOption } from '@/types/database';

interface ShippingCalculatorProps {
  compact?: boolean;
}

// Simulated shipping options based on CEP
const getShippingOptions = (cep: string): ShippingOption[] => {
  const region = cep.substring(0, 2);
  
  // Simulate different prices based on region
  const basePrice = parseInt(region) > 50 ? 25 : 18;
  
  return [
    {
      name: 'PAC',
      price: basePrice,
      deadline: '8 a 12 dias úteis',
      company: 'Correios'
    },
    {
      name: 'SEDEX',
      price: basePrice + 15,
      deadline: '3 a 5 dias úteis',
      company: 'Correios'
    },
    {
      name: 'Transportadora',
      price: basePrice + 5,
      deadline: '5 a 8 dias úteis',
      company: 'JadLog'
    }
  ];
};

export function ShippingCalculator({ compact = false }: ShippingCalculatorProps) {
  const { shippingZip, setShippingZip, selectedShipping, setSelectedShipping, subtotal } = useCart();
  const [localCep, setLocalCep] = useState(shippingZip);
  const [isLoading, setIsLoading] = useState(false);
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [hasCalculated, setHasCalculated] = useState(!!shippingZip && shippingOptions.length > 0);

  const formatCep = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 5) return numbers;
    return `${numbers.slice(0, 5)}-${numbers.slice(5, 8)}`;
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(price);
  };

  const handleCalculate = async () => {
    const cleanCep = localCep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;

    setIsLoading(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const options = getShippingOptions(cleanCep);
    setShippingOptions(options);
    setShippingZip(localCep);
    setHasCalculated(true);
    setIsLoading(false);

    // Check for free shipping
    if (subtotal >= 399) {
      setSelectedShipping({ ...options[0], price: 0 });
    }
  };

  const freeShippingEligible = subtotal >= 399;

  // Modern inline design (like the reference image)
  if (compact) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="00000-000"
            value={localCep}
            onChange={(e) => setLocalCep(formatCep(e.target.value))}
            maxLength={9}
            className="h-9 text-sm"
          />
          <Button 
            onClick={handleCalculate} 
            disabled={isLoading || localCep.replace(/\D/g, '').length !== 8}
            size="sm"
            variant="outline"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Calcular'}
          </Button>
        </div>

        {hasCalculated && shippingOptions.length > 0 && (
          <div className="space-y-2">
            {freeShippingEligible && (
              <div className="text-sm text-primary font-medium bg-primary/10 p-2 rounded">
                🎉 Você ganhou frete grátis!
              </div>
            )}
            
            {shippingOptions.map((option) => {
              const finalPrice = freeShippingEligible && option.name === 'PAC' ? 0 : option.price;
              const isSelected = selectedShipping?.name === option.name;
              
              return (
                <button
                  key={option.name}
                  onClick={() => setSelectedShipping({ ...option, price: finalPrice })}
                  className={`w-full p-3 rounded-lg border text-left transition-colors ${
                    isSelected 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm">
                        {option.name} - {option.company}
                      </p>
                      <p className="text-xs text-muted-foreground">{option.deadline}</p>
                    </div>
                    <div className="text-right">
                      {finalPrice === 0 ? (
                        <span className="text-primary font-bold">Grátis</span>
                      ) : (
                        <span className="font-medium">{formatPrice(finalPrice)}</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Full design (like the reference image - inline with icon)
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 p-4 border rounded-lg bg-muted/30">
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
            <Truck className="h-5 w-5 text-primary" />
          </div>
          <div className="hidden sm:block">
            <p className="font-medium text-sm">Frete e prazo de</p>
            <p className="font-medium text-sm">entrega</p>
          </div>
        </div>
        
        <div className="flex-1 flex gap-2">
          <Input
            placeholder="Informe seu CEP"
            value={localCep}
            onChange={(e) => setLocalCep(formatCep(e.target.value))}
            maxLength={9}
            className="border-0 bg-transparent focus-visible:ring-0 text-sm"
          />
          <Button 
            onClick={handleCalculate} 
            disabled={isLoading || localCep.replace(/\D/g, '').length !== 8}
            variant="link"
            className="font-semibold text-primary"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'CALCULAR'}
          </Button>
        </div>
      </div>

      {hasCalculated && shippingOptions.length > 0 && (
        <div className="space-y-2">
          {freeShippingEligible && (
            <div className="text-sm text-primary font-medium bg-primary/10 p-3 rounded-lg text-center">
              🎉 Parabéns! Você ganhou frete grátis!
            </div>
          )}
          
          {shippingOptions.map((option) => {
            const finalPrice = freeShippingEligible && option.name === 'PAC' ? 0 : option.price;
            const isSelected = selectedShipping?.name === option.name;
            
            return (
              <button
                key={option.name}
                onClick={() => setSelectedShipping({ ...option, price: finalPrice })}
                className={`w-full p-4 rounded-lg border text-left transition-all ${
                  isSelected 
                    ? 'border-primary bg-primary/5 shadow-sm' 
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      isSelected ? 'border-primary' : 'border-muted-foreground'
                    }`}>
                      {isSelected && <div className="w-2 h-2 rounded-full bg-primary" />}
                    </div>
                    <div>
                      <p className="font-medium">{option.name}</p>
                      <p className="text-sm text-muted-foreground">{option.company} • {option.deadline}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {finalPrice === 0 ? (
                      <span className="text-primary font-bold text-lg">Grátis</span>
                    ) : (
                      <span className="font-bold text-lg">{formatPrice(finalPrice)}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!hasCalculated && (
        <a 
          href="https://buscacepinter.correios.com.br/app/endereco/index.php" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline"
        >
          Não sei meu CEP
        </a>
      )}
    </div>
  );
}
