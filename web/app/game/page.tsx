import type { Metadata } from "next";
import { Chakra_Petch } from "next/font/google";
import { GameClient } from "./game-client";

const chakra = Chakra_Petch({ subsets: ["latin", "vietnamese"], weight: ["500", "700"], display: "swap" });

export const metadata: Metadata = {
  title: "Asteroid Storm · Trạm Tin",
  description: "Bắn thiên thạch giải trí giữa giờ đọc tin",
};

export default function GamePage() {
  return <GameClient font={chakra.style.fontFamily} fontClass={chakra.className} />;
}
