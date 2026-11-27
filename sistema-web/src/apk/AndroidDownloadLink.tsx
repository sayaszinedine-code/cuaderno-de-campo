"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { isInApk } from "./inApk";

/** «Descargar para Android» on the landing page; hidden inside the Android app itself. */
export function AndroidDownloadLink() {
  const [show, setShow] = useState(false);
  useEffect(() => setShow(!isInApk()), []);
  if (!show) return null;
  return (
    <Link href="/descargar/" className="btn-secondary sec-lima gap-2">
      <Icon name="instalar" />
      Descargar para Android
    </Link>
  );
}
