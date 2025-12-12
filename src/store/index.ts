import { configureStore } from '@reduxjs/toolkit'
import { persistStore, persistReducer } from 'redux-persist'
import storage from 'redux-persist/lib/storage'
import { baseApi } from '@/services/baseApi'
import authReducer from './authSlice'

// Individual persist configs for each slice
const authPersistConfig = {
  key: 'auth',
  storage,
  // You can add specific transforms or whitelist here if needed
}

// Future slices can have their own configs
// const userPreferencesPersistConfig = {
//   key: 'userPreferences',
//   storage,
//   whitelist: ['theme', 'language'], // Only persist specific fields
// }

// const projectsPersistConfig = {
//   key: 'projects',
//   storage,
//   // Persist all fields by default
// }

// Create persisted reducers
const persistedAuthReducer = persistReducer(authPersistConfig, authReducer)
// const persistedUserPreferencesReducer = persistReducer(userPreferencesPersistConfig, userPreferencesReducer)
// const persistedProjectsReducer = persistReducer(projectsPersistConfig, projectsReducer)

export const store = configureStore({
  reducer: {
    auth: persistedAuthReducer,
    // userPreferences: persistedUserPreferencesReducer,
    // projects: persistedProjectsReducer,
    [baseApi.reducerPath]: baseApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE', 'persist/PAUSE', 'persist/RESUME', 'persist/REGISTER'],
      },
    }).concat(baseApi.middleware),
})

export const persistor = persistStore(store)

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch