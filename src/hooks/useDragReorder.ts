import { useState, useCallback, DragEvent } from 'react';

interface UseDragReorderOptions<T extends { id: string }> {
  items: T[];
  onReorder: (reordered: T[]) => void;
}

export function useDragReorder<T extends { id: string }>({ items, onReorder }: UseDragReorderOptions<T>) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const onDragStart = useCallback((e: DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const onDragOver = useCallback((e: DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setHoverIndex(index);
  }, []);

  const onDragEnd = useCallback(() => {
    setDragIndex(null);
    setHoverIndex(null);
  }, []);

  const onDrop = useCallback((e: DragEvent, dropIndex: number) => {
    e.preventDefault();
    const fromIndex = dragIndex;
    if (fromIndex === null || fromIndex === dropIndex) {
      setDragIndex(null);
      setHoverIndex(null);
      return;
    }

    const reordered = [...items];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    
    onReorder(reordered);
    setDragIndex(null);
    setHoverIndex(null);
  }, [dragIndex, items, onReorder]);

  const getDragProps = (index: number) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => onDragStart(e, index),
    onDragOver: (e: DragEvent) => onDragOver(e, index),
    onDragEnd,
    onDrop: (e: DragEvent) => onDrop(e, index),
    style: {
      opacity: dragIndex === index ? 0.4 : 1,
      borderTop: hoverIndex === index && dragIndex !== index ? '2px solid hsl(var(--primary))' : undefined,
      transition: 'opacity 0.2s',
    } as React.CSSProperties,
  });

  return { getDragProps, dragIndex, hoverIndex };
}
