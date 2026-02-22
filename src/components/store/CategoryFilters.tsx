import { useState } from 'react';
import { ChevronDown, X, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface FilterState {
  priceRange: [number, number];
  sizes: string[];
  colors: string[];
  sortBy: string;
  onSale: boolean;
  isNew: boolean;
}

interface CategoryFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  availableSizes: string[];
  availableColors: { name: string; hex: string | null }[];
  maxPrice: number;
  productCount: number;
  isSidebar?: boolean;
}

const sortOptions = [
  { value: 'newest', label: 'Mais Recentes' },
  { value: 'oldest', label: 'Mais Antigos' },
  { value: 'price-asc', label: 'Menor Preço' },
  { value: 'price-desc', label: 'Maior Preço' },
  { value: 'name-asc', label: 'A-Z' },
  { value: 'name-desc', label: 'Z-A' },
];

export function CategoryFilters({
  filters,
  onFiltersChange,
  availableSizes,
  availableColors,
  maxPrice,
  productCount,
  isSidebar = false,
}: CategoryFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(price);
  };

  const handleSizeToggle = (size: string) => {
    const newSizes = filters.sizes.includes(size)
      ? filters.sizes.filter(s => s !== size)
      : [...filters.sizes, size];
    onFiltersChange({ ...filters, sizes: newSizes });
  };

  const handleColorToggle = (color: string) => {
    const newColors = filters.colors.includes(color)
      ? filters.colors.filter(c => c !== color)
      : [...filters.colors, color];
    onFiltersChange({ ...filters, colors: newColors });
  };

  const handleClearFilters = () => {
    onFiltersChange({
      priceRange: [0, maxPrice],
      sizes: [],
      colors: [],
      sortBy: 'newest',
      onSale: false,
      isNew: false,
    });
  };

  const hasActiveFilters = 
    filters.sizes.length > 0 || 
    filters.colors.length > 0 ||
    filters.onSale || 
    filters.isNew || 
    filters.priceRange[0] > 0 || 
    filters.priceRange[1] < maxPrice;

  const FilterContent = () => (
    <div className="space-y-6">
      {/* Price Range */}
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-2 font-medium">
          Preço
          <ChevronDown className="h-4 w-4" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4">
          <div className="space-y-4">
            <Slider
              min={0}
              max={maxPrice}
              step={10}
              value={filters.priceRange}
              onValueChange={(value) => onFiltersChange({ ...filters, priceRange: value as [number, number] })}
              className="w-full"
            />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{formatPrice(filters.priceRange[0])}</span>
              <span>{formatPrice(filters.priceRange[1])}</span>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Sizes */}
      {availableSizes.length > 0 && (
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex items-center justify-between w-full py-2 font-medium">
            Tamanho
            <ChevronDown className="h-4 w-4" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4">
            <div className="flex flex-wrap gap-2">
              {availableSizes.map((size) => (
                <button
                  key={size}
                  onClick={() => handleSizeToggle(size)}
                  className={`w-10 h-10 rounded-lg border text-sm font-medium transition-colors ${
                    filters.sizes.includes(size)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:border-primary'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Colors */}
      {availableColors.length > 0 && (
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex items-center justify-between w-full py-2 font-medium">
            Cor
            <ChevronDown className="h-4 w-4" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4">
            <div className="flex flex-wrap gap-2">
              {availableColors.map(({ name, hex }) => (
                <button
                  key={name}
                  onClick={() => handleColorToggle(name)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                    filters.colors.includes(name)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:border-primary'
                  }`}
                >
                  {hex && (
                    <span
                      className="w-4 h-4 rounded-full border border-border flex-shrink-0"
                      style={{ backgroundColor: hex }}
                    />
                  )}
                  {name}
                </button>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Promotions */}
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-2 font-medium">
          Promoções
          <ChevronDown className="h-4 w-4" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="on-sale"
              checked={filters.onSale}
              onCheckedChange={(checked) => onFiltersChange({ ...filters, onSale: checked as boolean })}
            />
            <label htmlFor="on-sale" className="text-sm cursor-pointer">
              Em promoção
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="is-new"
              checked={filters.isNew}
              onCheckedChange={(checked) => onFiltersChange({ ...filters, isNew: checked as boolean })}
            />
            <label htmlFor="is-new" className="text-sm cursor-pointer">
              Lançamentos
            </label>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {hasActiveFilters && (
        <Button variant="outline" className="w-full" onClick={handleClearFilters}>
          <X className="h-4 w-4 mr-2" />
          Limpar Filtros
        </Button>
      )}
    </div>
  );

  // Sidebar mode: just render filter content
  if (isSidebar) {
    return <FilterContent />;
  }

  // Toolbar mode: sort bar + mobile filter trigger
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b">
      <div className="flex items-center gap-4">
        {/* Mobile filter button */}
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="lg:hidden" size="sm">
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              Filtros
              {hasActiveFilters && (
                <span className="ml-2 bg-primary text-primary-foreground w-5 h-5 rounded-full text-xs flex items-center justify-center">
                  {filters.sizes.length + filters.colors.length + (filters.onSale ? 1 : 0) + (filters.isNew ? 1 : 0)}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80">
            <SheetHeader>
              <SheetTitle>Filtros</SheetTitle>
            </SheetHeader>
            <div className="mt-6">
              <FilterContent />
            </div>
          </SheetContent>
        </Sheet>

      </div>

      <Select
        value={filters.sortBy}
        onValueChange={(value) => onFiltersChange({ ...filters, sortBy: value })}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Ordenar por" />
        </SelectTrigger>
        <SelectContent>
          {sortOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
