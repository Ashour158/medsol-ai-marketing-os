# Module Boundaries

Marketing Control Plane owns cross-domain coordination and canonical marketing state.

Strategy owns market intelligence and recommendations. Product Marketing owns positioning and use cases. Brand owns brand rules. Scientific/Compliance owns scientific claims and evidence. CRM owns marketing lifecycle and attribution inputs. Analytics owns measurement and attribution. Operations owns campaign execution workflow. Approval owns approval decisions. Audit owns immutable activity history.

Modules communicate through explicit contracts, commands and events. No module reaches into another module's persistence tables as a shortcut.