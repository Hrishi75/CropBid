// The Grievance Officer's details as /privacy and /terms show them. One
// component so the two pages cannot drift; the details are in
// content/grievance.ts.
import { GRIEVANCE_OFFICER as G } from '../content/grievance';

export function GrievanceOfficer() {
  return (
    <>
      <p>
        <strong>{G.name}</strong>, {G.designation}
        <br />
        Email: <a href={`mailto:${G.email}`}>{G.email}</a>
        <br />
        Phone: <a href={G.phoneHref}>{G.phoneDisplay}</a>
      </p>
      <p>
        We acknowledge every complaint within {G.acknowledgeWithin} and resolve it within{' '}
        {G.resolveWithin} of receiving it. If a complaint about your personal data is not
        resolved to your satisfaction, you can take it to the Data Protection Board of India.
      </p>
    </>
  );
}
