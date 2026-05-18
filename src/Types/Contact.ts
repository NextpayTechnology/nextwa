export interface Contact {
	/** ID either in lid or jid format (preferred) **/
	id: string
	/** ID in LID format (@lid) **/
	lid?: string
	/** ID in PN format (@s.whatsapp.net)  **/
	phoneNumber?: string
	/** name of the contact, you have saved on your WA */
	name?: string
	/** name of the contact, the contact has set on their own on WA */
	notify?: string
	/** [PATCH-028] cherry-pick Baileys rc10 — username associated with this contact,
	 *  when provided by WA. Aparece em contactAction (app-state sync) e em outros
	 *  paths que normalizamos via processContactAction. Adicionado pra que LID/PN
	 *  mappings via contactAction não percam o `username`. */
	username?: string
	/** I have no idea */
	verifiedName?: string
	// Baileys Added
	/**
	 * Url of the profile picture of the contact
	 *
	 * 'changed' => if the profile picture has changed
	 * null => if the profile picture has not been set (default profile picture)
	 * any other string => url of the profile picture
	 */
	imgUrl?: string | null
	status?: string
}
