import 'package:bloc/bloc.dart';
import 'package:clicks_user/core/api/dio_helper.dart';
import 'package:clicks_user/core/api/end_points.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:clicks_user/features/my_cars/models/car_response_model.dart';
import 'package:clicks_user/features/my_cars/models/make_response_model.dart';
import 'package:clicks_user/features/my_cars/models/model_response_model.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/widgets.dart';

part 'my_cars_state.dart';

void _log(String msg) {
  if (kDebugMode) {
    // ignore: avoid_print
    print(msg);
  }
}

class MyCarsCubit extends Cubit<MyCarsState> {
  MyCarsCubit() : super(MyCarsInitial());

  List<CarResponseModel> cars = [];

  void getCars() async {
    emit(LoadingGetMyCarsState());
    try {
      var response = await DioHelper.getData(url: EndPoints.vehicles);

      if (response.statusCode == 200) {
        var data = response.data["vehicles"] as List;
        cars = data.map((e) => CarResponseModel.fromJson(e)).toList();
        emit(SuccessGetMyCarsState());
      } else {
        emit(ErrorGetMyCarsState('my_cars.error_try_again'.tr()));
      }
    } catch (e) {
      emit(ErrorGetMyCarsState('my_cars.error_try_again'.tr()));
    }
  }

  List<MakeResponseModel> makes = [];
  List<ModelResponseModel> models = [];

  void getMakes() async {
    selectedMake = null;
    selectedModel = null;
    models = [];
    emit(LoadingGetMakesMyCarsState());
    try {
      var response = await DioHelper.getData(url: EndPoints.getMakes);

      if (response.statusCode == 200) {
        var data = response.data["makes"] as List;
        makes = data.map((e) => MakeResponseModel.fromJson(e)).toList();
        emit(SuccessGetMakesMyCarsState());
      } else {
        emit(ErrorGetMakesMyCarsState());
      }
    } catch (e) {
      emit(ErrorGetMakesMyCarsState());
    }
  }

  MakeResponseModel? selectedMake;
  ModelResponseModel? selectedModel;

  void selectMake(MakeResponseModel? newMake) async {
    selectedMake = newMake;
    selectedModel = null;
    models = [];
    emit(LoadingGetModelsMyCarsState());
    if (selectedMake == null) {
      return;
    }
    try {
      var response = await DioHelper.getData(
        url: EndPoints.getModels,
        query: {"makeId": selectedMake!.sId},
      );

      if (response.statusCode == 200) {
        var data = response.data["models"] as List;
        models = data.map((e) => ModelResponseModel.fromJson(e)).toList();
        emit(SuccessGetModelsMyCarsState());
      } else {
        emit(ErrorGetModelsMyCarsState());
      }
    } catch (e) {
      emit(ErrorGetModelsMyCarsState());
    }
  }

  void selectModel(ModelResponseModel? newModel) {
    selectedModel = newModel;
    emit(SuccessSelectModelMyCarsState());
  }

  TextEditingController yearController = TextEditingController();
  TextEditingController colorController = TextEditingController();
  TextEditingController plateNumberController = TextEditingController();
  TextEditingController vinNumberController = TextEditingController();

  /// Parsed vehicle year, or null when the field does not hold a plain integer.
  int? get _parsedYear => int.tryParse(yearController.text.trim());

  void addVehicle(String customerId) async {
    final year = _parsedYear;
    if (year == null) {
      emit(ErrorAddMyCarsState('my_cars.year_invalid'.tr()));
      return;
    }
    emit(LoadingAddMyCarsState());
    try {
      var response = await DioHelper.postData(
        url: EndPoints.vehicles,
        data: {
          "customer_id": customerId,
          "vehicle_make": selectedMake!.sId,
          "vehicle_model": selectedModel!.sId,
          "year": year,
          "vehicle_color": colorController.text.trim(),
          "plate_number": plateNumberController.text.trim(),
          "vin_number": vinNumberController.text.trim(),
        },
      );

      if (response.statusCode == 201) {
        emit(SuccessAddMyCarsState());
      } else {
        _log('❌ Add vehicle error: ${response.data}');
        emit(ErrorAddMyCarsState(response.data["error"] ?? 'my_cars.failed_add_vehicle'.tr()));
      }
    } catch (e) {
      _log('❌ Add vehicle exception: $e');
      emit(ErrorAddMyCarsState('my_cars.error_try_again'.tr()));
    }
  }

  void updateVehicle(String vehicleId) async {
    final year = _parsedYear;
    if (year == null) {
      emit(ErrorAddMyCarsState('my_cars.year_invalid'.tr()));
      return;
    }
    emit(LoadingAddMyCarsState());
    try {
      var response = await DioHelper.putData(
        url: '${EndPoints.vehicles}/$vehicleId',
        data: {
          "vehicle_make": selectedMake!.sId,
          "vehicle_model": selectedModel!.sId,
          "year": year,
          "vehicle_color": colorController.text.trim(),
          "plate_number": plateNumberController.text.trim(),
          "vin_number": vinNumberController.text.trim(),
        },
      );

      if (response.statusCode == 200) {
        emit(SuccessAddMyCarsState());
      } else {
        _log('\u274c Update vehicle error: ${response.data}');
        emit(ErrorAddMyCarsState(response.data["error"] ?? 'my_cars.failed_update_vehicle'.tr()));
      }
    } catch (e) {
      _log('❌ Update vehicle exception: $e');
      emit(ErrorAddMyCarsState('my_cars.error_try_again'.tr()));
    }
  }

  void deleteVehicle(String vehicleId) async {
    emit(LoadingDeleteMyCarsState());
    try {
      var response = await DioHelper.deleteData(
        url: '${EndPoints.vehicles}/$vehicleId',
      );

      if (response.statusCode == 200) {
        cars.removeWhere((c) => c.sId == vehicleId);
        emit(SuccessDeleteMyCarsState());
      } else {
        emit(ErrorDeleteMyCarsState(response.data["error"] ?? "Delete failed"));
      }
    } catch (e) {
      emit(ErrorDeleteMyCarsState('my_cars.error_try_again'.tr()));
    }
  }

  CarResponseModel? selectedCar;
  void selectCar(CarResponseModel? car) {
    selectedCar = car;
    emit(SuccessSelectCarState());
  }
}
