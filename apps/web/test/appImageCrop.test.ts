import { describe, expect, it } from "vitest";
import { appImageCrop } from "@/lib/app-api/imageCrop";

const base = {
  imageKey: "events/affiche.jpg",
  imageFocusX: 0.5,
  imageFocusY: 0.2,
  imageFocusMobileX: null,
  imageFocusMobileY: null,
  imageZoomMobile: null,
  imageRatioMobile: null,
  imageFocusAppX: null,
  imageFocusAppY: null,
  imageZoomApp: null,
  imageRatioApp: null,
};

describe("appImageCrop", () => {
  it("geeft niets zonder eigen foto: de standaardbanner snijdt rond het midden", () => {
    expect(appImageCrop({ ...base, imageKey: null })).toBeNull();
  });

  it("volgt zonder eigen uitsneden het gewone punt, zonder zoom", () => {
    expect(appImageCrop(base)).toEqual({
      focus: { x: 0.5, y: 0.2 },
      hero: { x: 0.5, y: 0.2, zoom: 1, ratio: null },
    });
  });

  it("valt terug op de telefoonuitsnede", () => {
    const event = { ...base, imageFocusMobileX: 0.3, imageFocusMobileY: 0.4, imageZoomMobile: 0.8, imageRatioMobile: 1.78 };
    expect(appImageCrop(event)?.hero).toEqual({ x: 0.3, y: 0.4, zoom: 0.8, ratio: 1.78 });
  });

  it("verkiest de eigen app-uitsnede boven die van de telefoon", () => {
    const event = {
      ...base,
      imageFocusMobileX: 0.3,
      imageFocusMobileY: 0.4,
      imageZoomMobile: 0.8,
      imageRatioMobile: 1.78,
      imageFocusAppX: 0.6,
      imageFocusAppY: 0.1,
      imageZoomApp: 0.7,
      imageRatioApp: 1.78,
    };
    expect(appImageCrop(event)).toEqual({
      focus: { x: 0.5, y: 0.2 },
      hero: { x: 0.6, y: 0.1, zoom: 0.7, ratio: 1.78 },
    });
  });

  it("zoomt niet zonder de verhouding van de foto", () => {
    const event = { ...base, imageFocusAppX: 0.6, imageFocusAppY: 0.1, imageZoomApp: 0.7, imageRatioApp: null };
    expect(appImageCrop(event)?.hero).toEqual({ x: 0.6, y: 0.1, zoom: 1, ratio: null });
  });

  it("laat de uitsneden van het evenement los voor de eigen affiche van een moment", () => {
    const event = { ...base, imageFocusAppX: 0.6, imageFocusAppY: 0.1, imageZoomApp: 0.7, imageRatioApp: 1.78 };
    const shown = { ...event, imageKey: "events/moment.jpg", imageFocusX: 0.9, imageFocusY: 0.8 };
    expect(appImageCrop(event, shown)).toEqual({
      focus: { x: 0.9, y: 0.8 },
      hero: { x: 0.9, y: 0.8, zoom: 1, ratio: null },
    });
  });
});
