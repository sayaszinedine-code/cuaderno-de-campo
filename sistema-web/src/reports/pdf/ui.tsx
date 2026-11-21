/* Shared building blocks of the PDF documents. Only reachable through a dynamic import (see generate.tsx). */
import { Font, Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Field } from "./models";
import type { PdfPhoto } from "./photos";

// The built-in hyphenation uses English patterns («democrática-mente»): wrap Spanish text at spaces only.
Font.registerHyphenationCallback((word) => [word]);

export const TEAL = "#1f8a86";
export const TEAL_SOFT = "#e6f3f2";
const INK = "#1d2a2a";
const MUTED = "#5b6b6a";

export const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 48, paddingHorizontal: 40, fontFamily: "Helvetica", fontSize: 10, color: INK },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", color: TEAL, marginBottom: 6 },
  subtitle: { fontSize: 12, color: MUTED, marginBottom: 14 },
  h2: { fontSize: 13, fontFamily: "Helvetica-Bold", color: TEAL, marginTop: 12, marginBottom: 6 },
  paragraph: { fontSize: 11, lineHeight: 1.5, marginBottom: 8, textAlign: "justify" },
  box: { borderWidth: 1, borderColor: TEAL, borderRadius: 4, marginBottom: 6 },
  boxLabel: {
    backgroundColor: TEAL_SOFT,
    color: TEAL,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  boxValue: { paddingVertical: 4, paddingHorizontal: 6, minHeight: 18, lineHeight: 1.35 },
  bullet: { flexDirection: "row", marginBottom: 2 },
  bulletDot: { width: 10 },
  bulletText: { flex: 1 },
  photos: { flexDirection: "row", flexWrap: "wrap", marginTop: 4, marginBottom: 6 },
  photoCell: { width: "50%", padding: 3, alignItems: "center", justifyContent: "center" },
  photo: { maxWidth: "100%", objectFit: "contain" },
  muted: { color: MUTED },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 8, color: MUTED, textAlign: "right" },
});

/** A label/value box: the label on a soft teal band, the value (or a bullet list) below. */
export function FieldBox({ field }: { field: Field }) {
  return (
    <View style={s.box}>
      <Text style={s.boxLabel} minPresenceAhead={24}>
        {field.label}
      </Text>
      <View style={s.boxValue}>
        {field.list ? (
          field.list.map((item, i) => (
            <View key={i} style={s.bullet}>
              <Text style={s.bulletDot}>•</Text>
              <Text style={s.bulletText}>{item}</Text>
            </View>
          ))
        ) : (
          <Text>{field.value}</Text>
        )}
      </View>
    </View>
  );
}

/** Up to four photos in a 2×2 grid, each scaled to fit a cell `height` points tall. */
export function Photos({ photos, height = 190 }: { photos: PdfPhoto[]; height?: number }) {
  if (photos.length === 0) return null;
  return (
    <View style={s.photos} wrap={false}>
      {photos.map((p, i) => (
        <View key={i} style={[s.photoCell, { height }]}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- PDF image, not an HTML <img> */}
          <Image style={[s.photo, { maxHeight: height - 6 }]} src={p.src} />
        </View>
      ))}
    </View>
  );
}

export function PageNumber() {
  return <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />;
}
