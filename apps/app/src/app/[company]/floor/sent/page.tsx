// The reference, once (plan FLR, D8). Read from the signed cookie of the raise action and never from
// the URL. The client deletes the cookie through ./clear as soon as the page is on screen.
import { cookies } from "next/headers";
import QRCode from "qrcode";
import { SentView } from "@/components/floor/SentView";
import { FLOOR_SENT_COOKIE, verifyFloorCookie } from "@/features/floor/cookies";
import { companyOrigin, companyPrefix } from "@/features/tenant/urls";
import { findTenant } from "@/features/tenant";
import { getT } from "@/i18n/server";
import { floorSecret } from "@/server/floor/raise";

export async function generateMetadata() {
  return { title: (await getT())("floor.sentHeading") };
}

export default async function FloorSentPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const secret = floorSecret();
  const claims = secret ? verifyFloorCookie((await cookies()).get(FLOOR_SENT_COOKIE)?.value, secret) : null;
  const reference = typeof claims?.ref === "string" && /^\d{8}$/.test(claims.ref) ? claims.ref : null;
  const named = claims?.named === true;
  const role = typeof claims?.role === "string" ? claims.role : null;
  const tenant = await findTenant(company);

  // The fragment never reaches a server; the status page reads it in the browser.
  const qrSvg = reference && !named
    ? await QRCode.toString(`${companyOrigin(company)}${companyPrefix(company)}/floor/status#${reference}`, { type: "svg", errorCorrectionLevel: "M", margin: 4 })
    : null;
  const prefix = `${companyPrefix(company)}/floor`;

  return (
    <SentView
      reference={reference}
      roleTitle={reference ? role : null}
      named={named}
      sandbox={tenant?.stage === "sandbox"}
      qrSvg={qrSvg}
      raiseHref={prefix}
      clearHref={`${prefix}/sent/clear`}
    />
  );
}
