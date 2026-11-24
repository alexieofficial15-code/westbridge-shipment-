import type { Metadata } from "next";
import { ShipmentPortal } from "@/components/ShipmentPortal";

type Props = { params: Promise<{ trackingNumber: string }> };

const readTrackingNumber = async (params: Props["params"]) =>
  decodeURIComponent((await params).trackingNumber).trim().toUpperCase();

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return {
    title: `Shipment ${await readTrackingNumber(params)}`,
    // A shipment page is personal: keep it out of search engines.
    robots: { index: false, follow: false },
  };
}

/** The customer's shipment page. Its own slim bar replaces the landing page header and footer. */
export default async function TrackingPortalPage({ params }: Props) {
  return <ShipmentPortal trackingNumber={await readTrackingNumber(params)} />;
}
