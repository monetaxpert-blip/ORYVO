"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";

/** Offline navigation uses cached documents, never an HTML response as an RSC payload. */
export default function AppLink({ onClick, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink {...props} prefetch={false} onClick={(event) => {
    onClick?.(event);
    if (event.defaultPrevented || navigator.onLine || event.ctrlKey || event.metaKey || event.shiftKey || props.target === "_blank") return;
    event.preventDefault();
    window.location.assign(event.currentTarget.href);
  }} />;
}
