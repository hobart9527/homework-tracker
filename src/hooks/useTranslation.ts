"use client";

import { useTranslations as useNextTranslations } from "next-intl";

export function useTranslation() {
  const t = useNextTranslations();
  return { t };
}