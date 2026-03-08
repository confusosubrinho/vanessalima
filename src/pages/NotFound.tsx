import { useLocation, Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Search, Home, ShoppingBag, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StoreLayout } from "@/components/store/StoreLayout";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/busca?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <StoreLayout>
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center max-w-md mx-auto">
          <h1 className="text-7xl font-bold text-primary mb-4">404</h1>
          <p className="text-xl font-medium text-foreground mb-2">
            Página não encontrada
          </p>
          <p className="text-muted-foreground mb-8">
            A página que você procura pode ter sido removida, renomeada ou está temporariamente indisponível.
          </p>

          <form onSubmit={handleSearch} className="flex gap-2 mb-8">
            <Input
              type="search"
              placeholder="Buscar produtos..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 rounded-full"
            />
            <Button type="submit" size="icon" className="rounded-full shrink-0">
              <Search className="h-4 w-4" />
            </Button>
          </form>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild variant="default" className="rounded-full">
              <Link to="/">
                <Home className="h-4 w-4 mr-2" />
                Página Inicial
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/produtos">
                <ShoppingBag className="h-4 w-4 mr-2" />
                Ver Produtos
              </Link>
            </Button>
            <Button asChild variant="ghost" className="rounded-full">
              <Link to="/atendimento">
                <HelpCircle className="h-4 w-4 mr-2" />
                Ajuda
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </StoreLayout>
  );
};

export default NotFound;
