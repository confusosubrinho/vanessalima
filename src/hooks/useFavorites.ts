import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';

export function useFavorites() {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const { data: favorites = [] } = useQuery({
    queryKey: ['favorites', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('favorites')
        .select('product_id')
        .eq('user_id', userId);
      if (error) throw error;
      return data.map(f => f.product_id);
    },
    enabled: !!userId,
  });

  const toggleFavorite = useMutation({
    mutationFn: async (productId: string) => {
      if (!userId) throw new Error('not_authenticated');
      const isFav = favorites.includes(productId);
      if (isFav) {
        const { error } = await supabase
          .from('favorites')
          .delete()
          .eq('user_id', userId)
          .eq('product_id', productId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('favorites')
          .insert({ user_id: userId, product_id: productId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites', userId] });
    },
  });

  return {
    favorites,
    isAuthenticated: !!userId,
    toggleFavorite: toggleFavorite.mutate,
    isFavorite: (productId: string) => favorites.includes(productId),
    isLoading: toggleFavorite.isPending,
  };
}
