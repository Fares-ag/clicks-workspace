// import 'package:dio/dio.dart';
// import 'package:get_it/get_it.dart';

// import '../../features/auth/forget_password/ui/cubit/forget_password_cubit.dart';
// import '../../features/auth/login/ui/cubit/login_cubit.dart';
// import '../../features/auth/register/ui/cubit/register_cubit.dart';
// import '../../features/main/ui/cubit/home_cubit.dart';
// import '../../features/settings/ui/cubit/settings_cubit.dart';
// import '../../features/welcome/ui/cubit/welcome_cubit.dart';
// import '../api/api_client/api_client.dart';
// import '../api/api_client/base_dio.dart';
// import '../api/dio/dio_factory.dart';

// /// Global instance of GetIt for dependency injection
// final GetIt getIt = GetIt.instance;

// /// Sets up the GetIt instance with the necessary dependencies
// ///
// /// This function initializes the Dio instance and registers the
// /// necessary data sources and cubits.
// setupGetIt() {
//   final Dio dio = DioFactory.getDio();
//   getIt.registerSingleton<BaseDio>(ApiClient(options: dio.options, dio: dio));

//   _registerDataSources();
//   _registerCubits();
// }

// /// Registers the data sources with GetIt
// ///
// /// This function registers the implementations of the data sources
// /// as lazy singletons.
// _registerDataSources() {
//   // getIt.registerLazySingleton<LoginSource>(() => LoginImpl(getIt<BaseDio>()));
// }

// /// Registers the cubits with GetIt
// ///
// /// This function registers the cubits used in the application
// /// as factories.
// _registerCubits() {
//   getIt.registerFactory<WelcomeCubit>(() => WelcomeCubit());
//   getIt.registerFactory<LoginCubit>(() => LoginCubit());
//   getIt.registerFactory<RegisterCubit>(() => RegisterCubit());
//   getIt.registerFactory<ForgetPasswordCubit>(() => ForgetPasswordCubit());
//   getIt.registerFactory<HomeCubit>(() => HomeCubit());
//   getIt.registerFactory<SettingsCubit>(() => SettingsCubit());

//   // getIt.registerFactory<WelcomeCubit>(() => WelcomeCubit(getIt()));
// }
