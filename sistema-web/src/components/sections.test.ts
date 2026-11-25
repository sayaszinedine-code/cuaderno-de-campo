import { describe, expect, it } from "vitest";
import { sectionColor } from "./sections";

describe("sectionColor", () => {
  it("maps each screen to its color", () => {
    expect(sectionColor("/inicio/")).toBe("amarillo");
    expect(sectionColor("/cuaderno/")).toBe("rosa");
    expect(sectionColor("/ninos/")).toBe("celeste");
    expect(sectionColor("/notas/")).toBe("naranja");
    expect(sectionColor("/asistencia/")).toBe("lima");
    expect(sectionColor("/agenda/")).toBe("lila");
    expect(sectionColor("/reportes/")).toBe("lila");
    expect(sectionColor("/aulas/")).toBe("celeste");
    expect(sectionColor("/unidades/")).toBe("naranja");
  });

  it("sub-routes keep their parent's color", () => {
    expect(sectionColor("/cuaderno/registro/")).toBe("rosa");
    expect(sectionColor("/cuaderno/ver/")).toBe("rosa");
    expect(sectionColor("/notas/anual/")).toBe("naranja");
    expect(sectionColor("/ninos/ficha/")).toBe("celeste");
    expect(sectionColor("/unidades/sesion/")).toBe("naranja");
  });

  it("falls back to lila", () => {
    expect(sectionColor("/desconocido/")).toBe("lila");
    expect(sectionColor("/")).toBe("lila");
  });
});
