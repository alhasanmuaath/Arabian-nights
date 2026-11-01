
import {
  createAnnouncement,
  deleteAnnouncement,
} from '@/app/(app)/actions'
import { ActionForm, SubmitButton } from './ActionForm'

type Model = {
  id: string
  name: string
}

type Announcement = {
  id: string
  title: string
  body: string
  created_at: string
}

export function Announcements({
  models,
  announcements,
  canManage,
}: {
  models: Model[]
  announcements: Announcement[]
  canManage: boolean
}) {
  return (
    <div className="space-y-6">
      {canManage && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Publish announcement</h2>
          <p className="mt-1 text-sm text-gray-600">
            Share an update with selected models or everyone.
          </p>

          <ActionForm
            action={createAnnouncement}
            className="mt-4 space-y-4"
            resetOnSuccess
          >
            <div>
              <label htmlFor="announcement-title">Title</label>
              <input
                id="announcement-title"
                name="title"
                type="text"
                maxLength={150}
                required
                placeholder="Announcement title"
              />
            </div>

            <div>
              <label htmlFor="announcement-body">Message</label>
              <textarea
                id="announcement-body"
                name="body"
                rows={5}
                required
                placeholder="Write your announcement..."
              />
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="all_models"
                value="yes"
              />
              <span className="text-sm font-medium">
                Send to all models
              </span>
            </label>

            <fieldset className="rounded-lg border border-gray-200 p-3">
              <legend className="px-1 text-sm font-medium">
                Or select specific models
              </legend>

              {models.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No models found.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {models.map((model) => (
                    <label
                      key={model.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="person_ids"
                        value={model.id}
                      />
                      {model.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>

            <p className="text-xs text-gray-500">
              Selecting all models overrides individual selections.
            </p>

            <SubmitButton>Publish announcement</SubmitButton>
          </ActionForm>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Announcements ({announcements.length})
        </h2>

        {announcements.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
            <p className="font-medium">No announcements yet</p>
            <p className="mt-1 text-sm text-gray-500">
              New announcements will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-gray-200 bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="mt-1 text-xs text-gray-500">
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>

                  {canManage && (
                    <ActionForm action={deleteAnnouncement}>
                      <input
                        type="hidden"
                        name="id"
                        value={item.id}
                      />
                      <SubmitButton variant="danger">
                        Delete
                      </SubmitButton>
                    </ActionForm>
                  )}
                </div>

                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
