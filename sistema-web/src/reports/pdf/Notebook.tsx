import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { NotebookModel } from "./models";
import type { PdfPhoto } from "./photos";
import { FieldBox, PageNumber, Photos, TEAL, TEAL_SOFT, s } from "./ui";

/** Field-notebook export styled after the client's presentation. `photos[i]` belong to `model.pages[i]`. */
export function NotebookDocument({ model, photos }: { model: NotebookModel; photos: PdfPhoto[][] }) {
  const d = model.definition;
  return (
    <Document title={`Cuaderno de campo ${model.cover.year}`} language="es">
      <Page size="A4" style={[s.page, { backgroundColor: TEAL_SOFT, justifyContent: "center", alignItems: "center" }]}>
        <View style={{ borderWidth: 3, borderColor: TEAL, borderRadius: 8, paddingVertical: 60, paddingHorizontal: 50 }}>
          <Text style={{ fontSize: 36, fontFamily: "Helvetica-Bold", color: TEAL, textAlign: "center" }}>
            {model.cover.title}
          </Text>
          <Text style={{ fontSize: 28, fontFamily: "Helvetica-Bold", textAlign: "center", marginTop: 20 }}>
            {model.cover.year}
          </Text>
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.title}>{model.personal.title}</Text>
        {model.personal.fields.map((f) => (
          <View key={f.label} style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: TEAL, paddingVertical: 8 }}>
            <Text style={{ width: 120, fontFamily: "Helvetica-Bold", color: TEAL }}>{f.label}</Text>
            <Text style={{ flex: 1 }}>{f.value}</Text>
          </View>
        ))}
        <PageNumber />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.title}>{d.title}</Text>
        <Text style={s.paragraph}>{d.paragraph}</Text>
        <Text style={s.h2}>{d.whenTitle}</Text>
        <Text style={s.paragraph}>{d.whenIntro}</Text>
        {d.bullets.map((b) => (
          <View key={b} style={[s.bullet, { marginBottom: 4 }]}>
            <Text style={s.bulletDot}>•</Text>
            <Text style={[s.bulletText, { fontSize: 11, lineHeight: 1.4 }]}>{b}</Text>
          </View>
        ))}
        <Text style={[s.paragraph, { marginTop: 14, backgroundColor: TEAL_SOFT, padding: 8, borderRadius: 4 }]}>
          {d.important}
        </Text>
        <PageNumber />
      </Page>

      {model.pages.length === 0 && (
        <Page size="A4" style={s.page}>
          <Text style={s.muted}>{model.empty}</Text>
          <PageNumber />
        </Page>
      )}
      {model.pages.map((p, i) => (
        <Page key={p.id} size="A4" style={s.page}>
          {p.fields.map((f) => (
            <View key={f.label}>
              <FieldBox field={f} />
              {f.label === "EVIDENCIAS:" && <Photos photos={photos[i] ?? []} height={130} />}
            </View>
          ))}
          <PageNumber />
        </Page>
      ))}
    </Document>
  );
}
