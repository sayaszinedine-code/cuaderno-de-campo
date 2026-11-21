import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { ProgressModel } from "./models";
import { FieldBox, PageNumber, TEAL, TEAL_SOFT, s } from "./ui";

const cell = { padding: 5, borderRightWidth: 1, borderColor: TEAL };

export function ProgressReportDocument({ model }: { model: ProgressModel }) {
  const scale = model.columns.length === 3;
  const widths = scale ? ["32%", "18%", "50%"] : ["38%", "62%"];
  const child = model.data[0]?.value ?? "";
  return (
    <Document title={`${model.title} - ${child} - ${model.periodName}`} language="es">
      <Page size="A4" style={s.page}>
        <Text style={s.title}>{model.title}</Text>
        <Text style={s.subtitle}>{model.periodName}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -3 }}>
          {model.data.map((f) => (
            <View key={f.label} style={{ width: "50%", paddingHorizontal: 3 }}>
              <FieldBox field={f} />
            </View>
          ))}
        </View>

        <Text style={s.h2}>Competencias</Text>
        <View style={{ borderWidth: 1, borderColor: TEAL, borderRightWidth: 0, borderBottomWidth: 0 }}>
          <View style={{ flexDirection: "row", backgroundColor: TEAL_SOFT, borderBottomWidth: 1, borderColor: TEAL }} fixed>
            {model.columns.map((c, i) => (
              <Text key={c} style={[cell, { width: widths[i], fontFamily: "Helvetica-Bold", color: TEAL }]}>
                {c}
              </Text>
            ))}
          </View>
          {model.rows.map((r) => (
            <View key={r.competency} style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: TEAL }} wrap={false}>
              <Text style={[cell, { width: widths[0] }]}>{r.competency}</Text>
              {scale && <Text style={[cell, { width: widths[1], textAlign: "center", fontFamily: "Helvetica-Bold" }]}>{r.level ?? ""}</Text>}
              <Text style={[cell, { width: widths[scale ? 2 : 1] }]}>{r.conclusion}</Text>
            </View>
          ))}
        </View>
        {model.legend.length > 0 && (
          <Text style={[s.muted, { marginTop: 4, fontSize: 9 }]}>
            {model.legend.map((l) => `${l.label}: ${l.value}`).join("   ")}
          </Text>
        )}

        <View wrap={false}>
          <Text style={s.h2}>{model.attendanceTitle}</Text>
          {model.attendance.length === 0 ? (
            <Text style={s.muted}>{model.attendanceEmpty}</Text>
          ) : (
            <View style={{ flexDirection: "row", marginHorizontal: -3 }}>
              {model.attendance.map((f) => (
                <View key={f.label} style={{ flex: 1, paddingHorizontal: 3 }}>
                  <FieldBox field={f} />
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={{ marginTop: 70, alignItems: "center" }} wrap={false}>
          <View style={{ width: 220, borderTopWidth: 1, borderColor: "#1d2a2a", marginBottom: 4 }} />
          <Text>{model.signature.label}</Text>
          {model.signature.name !== "" && <Text style={s.muted}>{model.signature.name}</Text>}
        </View>
        <PageNumber />
      </Page>
    </Document>
  );
}
