import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCustomers from "./tools/list_customers";
import searchCustomerByPhone from "./tools/search_customer_by_phone";
import listMyCallLogs from "./tools/list_my_call_logs";
import addCustomerNote from "./tools/add_customer_note";

// OAuth issuer must be the direct Supabase host. On publish, SUPABASE_URL is
// rewritten to the .lovable.cloud proxy, which mcp-js rejects (issuer mismatch).
// The project ref survives publish, and Vite inlines VITE_* at build time.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "hanpass-ob-crm-mcp",
  title: "Hanpass OB CRM",
  version: "0.1.0",
  instructions:
    "Tools for the Hanpass OB CRM. Use `list_customers` and `search_customer_by_phone` to look up customers, `list_my_call_logs` to review recent phone calls, and `add_customer_note` to attach a note to a customer. All calls run as the signed-in user with row-level security enforced.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listCustomers, searchCustomerByPhone, listMyCallLogs, addCustomerNote],
});
