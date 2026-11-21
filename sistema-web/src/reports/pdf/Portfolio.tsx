import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { PortfolioModel } from "./models";
import type { PdfPhoto } from "./photos";
import { FieldBox, PageNumber, Photos, s } from "./ui";

/** `photos[i]` are the loaded photos of `model.entries[i]`. */
export function PortfolioDocument({ model, photos }: { model: PortfolioModel; photos: PdfPhoto[][] }) {
  const child = model.cover[0]?.value ?? "";
  return (
    <Document title={`${model.title} - ${child}`} language="es">
      <Page size="A4" style={s.page}>
        <View style={{ marginTop: 160 }}>
          <Text style={[s.title, { fontSize: 28, textAlign: "center", marginBottom: 40 }]}>{model.title}</Text>
          {model.cover.map((f) => (
            <FieldBox key={f.label} field={f} />
          ))}
        </View>
        <PageNumber />
      </Page>
      <Page size="A4" style={s.page}>
        {model.entries.length === 0 && <Text style={s.muted}>{model.empty}</Text>}
        {model.entries.map((e, i) => (
          <View key={e.id} style={{ marginBottom: 14 }} break={i > 0}>
            <Text style={s.h2}>{`Registro ${i + 1}`}</Text>
            {e.fields.map((f) => (
              <FieldBox key={f.label} field={f} />
            ))}
            <Photos photos={photos[i] ?? []} />
          </View>
        ))}
        <PageNumber />
      </Page>
    </Document>
  );
}
