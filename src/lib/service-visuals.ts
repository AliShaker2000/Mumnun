import build from "@/assets/service-build.png";
import plaster from "@/assets/service-plaster.png";
import carpentryForm from "@/assets/service-carpentry_form.png";
import flooring from "@/assets/service-flooring.png";
import chef from "@/assets/service-chef.png";
import plumbing from "@/assets/service-plumbing.png";
import electricSetup from "@/assets/service-electric_setup.png";
import electricStreet from "@/assets/service-electric_street.png";
import washer from "@/assets/service-washer_repair.png";
import stove from "@/assets/service-stove_repair.png";
import fridge from "@/assets/service-fridge_repair.png";
import ac from "@/assets/service-ac_repair.png";
import cleaning from "@/assets/service-cleaning.png";
import wood from "@/assets/service-wood_carpentry.png";
import blacksmith from "@/assets/service-blacksmith.png";
import general from "@/assets/service-general.png";
import goods from "@/assets/service-goods_transport.png";
import furniture from "@/assets/service-furniture_moving.png";
import cargo from "@/assets/service-cargo_handling.png";
import gardener from "@/assets/service-gardener.png";
import kiaDriver from "@/assets/service-kia-driver.png";
import internet from "@/assets/service-internet.png";
import fallback from "@/assets/service-fallback.png";

const serviceIcons: Record<string, string> = {
  build, plaster, carpentry_form: carpentryForm, flooring, chef, plumbing,
  electric_setup: electricSetup, electric_street: electricStreet,
  washer_repair: washer, stove_repair: stove, fridge_repair: fridge,
  ac_repair: ac, cleaning, wood_carpentry: wood, blacksmith, general,
  goods_transport: goods, furniture_moving: furniture, cargo_handling: cargo,
  gardener, kia_driver: kiaDriver, internet_install: internet,
};

export function serviceIcon(slug: string): string {
  return serviceIcons[slug] ?? fallback;
}