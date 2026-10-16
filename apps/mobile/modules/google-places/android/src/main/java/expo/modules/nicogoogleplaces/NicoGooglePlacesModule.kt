package expo.modules.nicogoogleplaces

import android.content.pm.PackageManager
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.maps.model.LatLng
import com.google.android.libraries.places.api.Places
import com.google.android.libraries.places.api.model.Place
import com.google.android.libraries.places.api.model.RectangularBounds
import com.google.android.libraries.places.api.net.PlacesStatusCodes
import com.google.android.libraries.places.api.net.SearchByTextRequest
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.cos

class NicoGooglePlacesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NicoGooglePlaces")
    AsyncFunction("search") Coroutine { query: String, latitude: Double?, longitude: Double? ->
      if (query.trim().length < 2) return@Coroutine emptyList<Map<String, Any>>()
      val context = appContext.reactContext ?: throw CodedException("Place search is unavailable.")
      val info = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
      val key = info.metaData?.getString("com.google.android.geo.API_KEY")?.trim()
      if (key.isNullOrEmpty()) throw CodedException("Google place search is not configured.")
      withContext(Dispatchers.Main) {
        if (!Places.isInitialized()) Places.initializeWithNewPlacesApiEnabled(context, key)
        val request = SearchByTextRequest.builder(query.trim(), listOf(
          Place.Field.ID, Place.Field.DISPLAY_NAME, Place.Field.FORMATTED_ADDRESS, Place.Field.LOCATION
        )).setMaxResultCount(20)
        if (latitude != null && longitude != null) {
          val dLat = 10000.0 / 111320.0
          val dLng = dLat / maxOf(0.01, cos(Math.toRadians(latitude)))
          fun wrap(value: Double) = ((value + 540.0) % 360.0) - 180.0
          request.setLocationRestriction(RectangularBounds.newInstance(
            LatLng(maxOf(-90.0, latitude - dLat), wrap(longitude - dLng)),
            LatLng(minOf(90.0, latitude + dLat), wrap(longitude + dLng))
          ))
        }
        suspendCancellableCoroutine<List<Map<String, Any>>> { continuation ->
          Places.createClient(context).searchByText(request.build())
            .addOnSuccessListener { response ->
              val places = response.places.mapNotNull { place ->
                val point = place.location ?: return@mapNotNull null
                val id = place.id ?: return@mapNotNull null
                mapOf<String, Any>(
                  "id" to id,
                  "name" to (place.displayName ?: "Place"),
                  "address" to (place.formattedAddress ?: ""),
                  "location" to mapOf("latitude" to point.latitude, "longitude" to point.longitude)
                )
              }
              if (continuation.isActive) continuation.resume(places)
            }
            .addOnFailureListener { error ->
              // Never return SDK messages containing credentials or request URLs.
              val status = if (error is ApiException) PlacesStatusCodes.getStatusCodeString(error.statusCode) else "NETWORK_ERROR"
              if (continuation.isActive) continuation.resumeWithException(CodedException("Google place search: $status"))
            }
        }
      }
    }
  }
}
