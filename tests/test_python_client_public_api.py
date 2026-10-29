"""Public import surface checks for the generated Python client bundle."""


def test_all_documented_names_are_available_from_package_root():
    import astrid_runtime_client as package
    from astrid_runtime_client import ApiError, CONTRACT_VERSION, PreferenceResource, WorkspaceClient

    assert CONTRACT_VERSION
    assert isinstance(CONTRACT_VERSION, str)
    assert issubclass(ApiError, RuntimeError)
    assert callable(WorkspaceClient) and callable(PreferenceResource.from_json)
    assert package.__all__
    assert all(hasattr(package, name) for name in package.__all__)
