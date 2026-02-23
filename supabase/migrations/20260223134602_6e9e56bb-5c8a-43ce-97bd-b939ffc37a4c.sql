
ALTER TABLE public.banners ADD COLUMN show_on_desktop boolean NOT NULL DEFAULT true;
ALTER TABLE public.banners ADD COLUMN show_on_mobile boolean NOT NULL DEFAULT true;
