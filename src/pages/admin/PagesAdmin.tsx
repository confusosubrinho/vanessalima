import { PagesEditor } from '@/components/admin/PagesEditor';

export default function PagesAdmin() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Páginas Institucionais</h1>
      <p className="text-muted-foreground">Edite o conteúdo das páginas institucionais da loja (FAQ, Sobre, Termos, etc.).</p>
      <PagesEditor />
    </div>
  );
}
